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
    .get('/login-success', ({ query, cookie, set }) => {
        // Check for both standard and secure cookie names
        const sessionToken = (cookie['better-auth.session_token']?.value ||
            cookie['__Secure-better-auth.session_token']?.value) as string | undefined;

        // Handle CLI Loopback Flow
        // If a CLI redirect URI is present (and safe), redirect the browser there with the token
        const cliRedirect = query.cli_redirect_uri;
        let redirectUrl: string | undefined;

        if (sessionToken && cliRedirect && typeof cliRedirect === 'string') {
            try {
                const url = new URL(cliRedirect);
                // Security: Only allow redirect to localhost/127.0.0.1 for CLI handoff
                if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
                    url.searchParams.set('token', sessionToken);

                    // Client-side redirect to avoid "Mixed Content" blocking (HTTPS -> HTTP)
                    // We render the success page which then redirects via JS
                    redirectUrl = url.toString();
                }
            } catch (e) {
                // Ignore invalid URLs
            }
        }

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
        .redirect-notice { margin-top: 1rem; font-size: 0.875rem; color: #6b7280; }
        a { color: #2563eb; text-decoration: none; }
    </style>
</head>
<body>
    <div class="card">
        <h1>Login Successful</h1>
        ${redirectUrl ? `<p>Redirecting you back to the CLI...</p><p class="redirect-notice">If you are not redirected, <a href="${redirectUrl}">click here</a>.</p>` : ''}
        
        ${!redirectUrl ? `
        <p>You have successfully authenticated. Copy the session token below and paste it into your CLI.</p>
        <div id="token" class="token-box">${tokenDisplay}</div>
        <button onclick="copyToken()" id="copyBtn" ${!sessionToken ? 'disabled' : ''}>Copy Token</button>
        ` : ''}
    </div>

    <script>
        const token = "${sessionToken || ''}";
        const redirectUrl = "${redirectUrl || ''}";

        if (redirectUrl) {
            setTimeout(() => {
                window.location.href = redirectUrl;
            }, 1000);
        }
        
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
</html>`, {
            headers: {
                'Content-Type': 'text/html'
            }
        });
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
                // Check if there is a CLI redirect URI in the current URL
                const params = new URLSearchParams(window.location.search);
                const cliRedirect = params.get('cli_redirect_uri');
                
                const origin = window.location.origin;
                // Construct callback URL, passing through the CLI redirect if present
                let callbackURL = origin + '/login-success';
                if (cliRedirect) {
                    callbackURL += '?cli_redirect_uri=' + encodeURIComponent(cliRedirect);
                }

                const res = await fetch(origin + '/api/auth/sign-in/social', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        provider: 'google',
                        callbackURL: callbackURL
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
    .get('/', () => new Response(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pairit Manager</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --slate-50: #f8fafc;
            --slate-100: #f1f5f9;
            --slate-200: #e2e8f0;
            --slate-600: #475569;
            --slate-900: #0f172a;
        }
        
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            font-family: 'Inter', -apple-system, system-ui, sans-serif;
            background-color: var(--slate-50);
            color: var(--slate-900);
            line-height: 1.5;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
        }

        .header {
            background: rgba(255, 255, 255, 0.8);
            backdrop-filter: blur(8px);
            border-bottom: 1px solid var(--slate-200);
            padding: 1rem 1.5rem;
            position: sticky;
            top: 0;
            z-index: 10;
        }

        .header-content {
            max-width: 1024px;
            margin: 0 auto;
            display: flex;
            align-items: center;
            gap: 0.75rem;
        }

        .logo {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            font-weight: 700;
            font-size: 1.25rem;
            color: var(--slate-900);
        }

        .container {
            max-width: 1024px;
            margin: 0 auto;
            padding: 6rem 1.5rem;
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
        }

        .hero {
            margin-bottom: 3rem;
        }

        h1 {
            font-size: 2.5rem;
            font-weight: 700;
            letter-spacing: -0.025em;
            margin-bottom: 1rem;
            color: var(--slate-900);
        }

        .subtitle {
            font-size: 1.125rem;
            color: var(--slate-600);
            max-width: 600px;
        }

        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 1.5rem;
        }

        .card {
            background: white;
            border: 1px solid var(--slate-200);
            border-radius: 1.5rem;
            padding: 3rem;
            transition: all 0.2s ease;
            display: flex;
            flex-direction: column;
            align-items: center;
            max-width: 450px;
            width: 100%;
        }

        .card:hover {
            border-color: var(--slate-200);
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
            transform: translateY(-2px);
        }

        .card h2 {
            font-size: 1.5rem;
            font-weight: 600;
            margin-bottom: 1rem;
            display: flex;
            align-items: center;
            gap: 0.75rem;
        }

        .card p {
            color: var(--slate-600);
            font-size: 1rem;
            margin-bottom: 2.5rem;
        }

        .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            padding: 0.75rem 1.5rem;
            border-radius: 0.75rem;
            font-weight: 600;
            font-size: 1rem;
            text-decoration: none;
            transition: all 0.2s;
            cursor: pointer;
        }

        .btn-primary {
            background-color: var(--slate-900);
            color: white;
        }

        .btn-primary:hover {
            background-color: #1e293b;
        }

        .footer {
            border-top: 1px solid var(--slate-200);
            padding: 1.5rem;
            background: white;
        }

        .footer-content {
            max-width: 1024px;
            margin: 0 auto;
            font-size: 0.75rem;
            color: var(--slate-600);
            display: flex;
            justify-content: space-between;
        }

        .icon {
            width: 24px;
            height: 24px;
            stroke: currentColor;
            stroke-width: 2;
            fill: none;
        }
    </style>
</head>
<body>
    <header class="header">
        <div class="header-content">
            <div class="logo">
                <svg class="icon" viewBox="0 0 24 24"><path d="M16 8l2 -2m0 0l-12 0m12 0l0 12m-2 -2l-2 2"></path><circle cx="12" cy="12" r="9"></circle></svg>
                Pairit Manager
            </div>
        </div>
    </header>

    <main class="container">
        <section class="hero">
            <h1>Platform Admin</h1>
            <p class="subtitle">Consolidated management for your experiments, media assets, and configurations.</p>
        </section>

        <div class="card">
            <div>
                <h2>
                    <svg class="icon" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="14.31" y1="8" x2="20.05" y2="17.94"></line><line x1="9.69" y1="8" x2="21.17" y2="8"></line><line x1="7.38" y1="12" x2="13.12" y2="2.06"></line><line x1="9.69" y1="16" x2="3.95" y2="6.06"></line><line x1="14.31" y1="16" x2="2.83" y2="16"></line><line x1="16.62" y1="12" x2="10.88" y2="21.94"></line></svg>
                    Lab Environment
                </h2>
                <p>Switch to the researcher environment to preview or participate in active experiments.</p>
            </div>
            <a href="https://pairit-lab-823036187164.us-central1.run.app" class="btn btn-primary">Go to Lab</a>
        </div>
    </main>

    <footer class="footer">
        <div class="footer-content">
            <span>Pairit Manager · Management Console</span>
            <span>&copy; 2025 Pairium AI</span>
        </div>
    </footer>
</body>
</html>`, { headers: { 'content-type': 'text/html' } }))
    .use(configsRoutes)
    .use(mediaRoutes)
    .listen(Number(process.env.PORT) || 3002);

console.log(`🚀 Manager server running on ${app.server?.hostname}:${app.server?.port}`);
