/**
 * Manager Server Entry Point
 * Elysia app with config and media management
 */
import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { auth } from '../../../lib/auth';
import { configsRoutes } from './routes/configs';
import { mediaRoutes } from './routes/media';

const app = new Elysia()
    .use(
        cors({
            origin: '*',
            methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
            exposeHeaders: ['Content-Type'],
            maxAge: 86400,
        })
    )
    .onError(({ code, error, set }) => {
        console.error(`[Elysia Error] ${code}:`, error);
        set.status = 500;
        // Check if error has message property safely
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
            status: 'error',
            code,
            message
        };
    })
    // Mount Better Auth handler at /api/auth/*
    .all('/api/auth/*', async ({ request, set }) => {
        try {
            console.log(`[Auth Request] ${request.method} ${request.url}`);
            const res = await auth.handler(request);
            console.log(`[Auth Response] Status: ${res.status}`);

            // If it's a 4xx or 5xx, or if we want to debug, log the body
            if (res.status >= 400) {
                try {
                    const clone = res.clone();
                    const text = await clone.text();
                    console.log(`[Auth Response Body] ${text}`);
                } catch (e) {
                    console.log(`[Auth Response Body] Could not read body: ${e}`);
                }
            }

            return res;
        } catch (error) {
            console.error('[Auth Fatal Error]:', error);
            set.status = 500;
            return {
                error: 'Internal Server Error',
                message: error instanceof Error ? error.message : String(error)
            };
        }
    })
    .get('/db-test', async () => {
        try {
            const { connectDB } = await import('./lib/db');
            const database = await connectDB();
            if (!database) throw new Error('Database connection failed to return a Db object');

            const collections = await database.listCollections().toArray();
            return {
                status: 'ok',
                databaseName: database.databaseName,
                collections: collections.map(c => c.name)
            };
        } catch (error) {
            console.error('[DB Test Error]:', error);
            return {
                status: 'error',
                message: error instanceof Error ? error.message : String(error)
            };
        }
    })
    .get('/debug-env', () => {
        const uri = process.env.MONGODB_URI || 'FAILOVER_TO_DEFAULT';
        const redactedUri = uri.length > 20
            ? `${uri.substring(0, 15)}...${uri.substring(uri.length - 10)}`
            : uri;

        return {
            MONGODB_URI_REDACTED: redactedUri,
            ENV_KEYS: Object.keys(process.env).filter(k => !k.includes('SECRET') && !k.includes('PASSWORD')),
            GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? 'SET' : 'MISSING',
            AUTH_BASE_URL: process.env.AUTH_BASE_URL || 'MISSING'
        };
    })
    .get('/login-success', ({ cookie }) => {
        // Check for both standard and secure cookie names
        const sessionToken = cookie['better-auth.session_token']?.value ||
            cookie['__Secure-better-auth.session_token']?.value;

        const tokenDisplay = sessionToken || 'Error: Session token not found. Please try logging in again.';
        const tokenColor = sessionToken ? '#f3f4f6' : '#fef2f2';
        const textColor = sessionToken ? '#111827' : '#dc2626';

        return new Response(`<!DOCTYPE html>
<html>
<head>
    <title>Login Successful</title>
    <style>
        body { font-family: system-ui, -apple-system, sans-serif; padding: 2rem; max-width: 600px; margin: 0 auto; text-align: center; background: #f9fafb; color: #111827; }
        .card { background: white; padding: 2.5rem; border-radius: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); border: 1px solid #e5e7eb; }
        h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 1rem; color: #059669; }
        p { color: #4b5563; margin-bottom: 1.5rem; line-height: 1.5; }
        .token-box { background: ${tokenColor}; color: ${textColor}; padding: 1rem; border-radius: 6px; font-family: monospace; word-break: break-all; margin-bottom: 1.5rem; border: 1px solid #d1d5db; font-size: 0.875rem; }
        button { background: #2563eb; color: white; border: none; padding: 10px 20px; font-size: 14px; font-weight: 600; border-radius: 6px; cursor: pointer; transition: background 0.2s; }
        button:hover { background: #1d4ed8; }
        button:disabled { background: #9ca3af; cursor: not-allowed; }
    </style>
</head>
<body>
    <div class="card">
        <h1>Login Successful</h1>
        <p>You have successfully authenticated. Copy the session token below and paste it into your CLI.</p>
        <div id="token" class="token-box">${tokenDisplay}</div>
        <button onclick="copyToken()" id="copyBtn" ${!sessionToken ? 'disabled' : ''}>Copy Token</button>
    </div>

    <script>
        const token = "${sessionToken || ''}";
        
        async function copyToken() {
            if (token) {
                try {
                    await navigator.clipboard.writeText(token);
                    const btn = document.getElementById('copyBtn');
                    const originalText = btn.innerText;
                    btn.innerText = 'Copied!';
                    btn.style.background = '#059669';
                    setTimeout(() => {
                        btn.innerText = originalText;
                        btn.style.background = '#2563eb';
                    }, 2000);
                } catch (err) {
                    alert('Failed to copy token');
                }
            }
        }
    </script>
</body>
</html>`, { headers: { 'content-type': 'text/html' } });
    })
    .get('/login', () => new Response(`<!DOCTYPE html>
<html>
<head>
    <title>Pairit CLI Login</title>
    <style>
        body { font-family: system-ui, -apple-system, sans-serif; padding: 2rem; max-width: 600px; margin: 0 auto; text-align: center; background: #f9fafb; color: #111827; }
        .card { background: white; padding: 2.5rem; border-radius: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); border: 1px solid #e5e7eb; }
        h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 1rem; }
        p { color: #4b5563; margin-bottom: 2rem; line-height: 1.5; }
        button { background: #2563eb; color: white; border: none; padding: 12px 24px; font-size: 16px; font-weight: 600; border-radius: 6px; cursor: pointer; transition: background 0.2s; }
        button:hover { background: #1d4ed8; }
        .footer { margin-top: 2rem; font-size: 0.875rem; color: #6b7280; }
    </style>
</head>
<body>
    <div class="card">
        <h1>Pairit CLI Login</h1>
        <p>Click the button below to sign in with Google. You will be redirected to a page with your session token.</p>
        <button onclick="login()">Sign in with Google</button>
    </div>
    <div class="footer">
        Pairit Management Console
    </div>

    <script>
        async function login() {
            try {
                const origin = window.location.origin;
                const res = await fetch(origin + '/api/auth/sign-in/social', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        provider: 'google',
                        callbackURL: origin + '/login-success' 
                    })
                });
                const data = await res.json();
                if (data.url) {
                    window.location.href = data.url;
                } else {
                    alert('Error: ' + JSON.stringify(data));
                }
            } catch (err) {
                alert('Error: ' + err.message);
            }
        }
    </script>
</body>
</html>`, { headers: { 'content-type': 'text/html' } }))
    .get('/', () => ({ message: 'Pairit manager API' }))
    .use(configsRoutes)
    .use(mediaRoutes)
    .listen(Number(process.env.PORT) || 3002);

console.log(`🚀 Manager server running on ${app.server?.hostname}:${app.server?.port}`);
