/**
 * Manager Server Entry Point
 * Elysia app with config and media management
 */
import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { auth } from '../../../lib/auth';
import { configsRoutes } from './routes/configs';
import { mediaRoutes } from './routes/media';
import { renderPage } from '@pairit/html';

const IS_DEV = process.env.NODE_ENV === 'development';
const ALLOWED_ORIGINS = process.env.CORS_ORIGINS?.split(',').map(s => s.trim()) || ['*'];
const LAB_URL = process.env.PAIRIT_LAB_URL || 'http://localhost:3001';

const app = new Elysia()
    .use(
        cors({
            origin: IS_DEV ? '*' : ALLOWED_ORIGINS,
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
    });

// Debug endpoints only available in non-production
if (IS_DEV) {
    app
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
        });
}

app
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

        const content = `
        <div class="card">
            <h1>
                <svg class="icon" viewBox="0 0 24 24" style="color: var(--emerald-600); width: 32px; height: 32px;">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Login Successful
            </h1>
            
            ${redirectUrl ? `
                <p>Redirecting you back to the CLI...</p>
                <div style="margin-top: 1rem; font-size: 0.875rem; color: var(--slate-600);">
                    If you are not redirected, <a href="${redirectUrl}">click here</a>.
                </div>
            ` : `
                <p>You have successfully authenticated. You can now close this window and return to your CLI.</p>
                <div style="margin-top: 1.5rem;">
                    <button onclick="window.close()" class="btn btn-blue">Close Window</button>
                </div>
            `}
        </div>`;

        const scriptContent = `
        <script>
            const redirectUrl = "${redirectUrl || ''}";

            if (redirectUrl) {
                setTimeout(() => {
                    window.location.href = redirectUrl;
                }, 1000);
            }
        </script>`;

        return new Response(renderPage({
            title: 'Login Successful',
            content,
            scripts: scriptContent
        }), {
            headers: {
                'Content-Type': 'text/html'
            }
        });
    })
    .get('/login', () => {
        const content = `
        <div class="card">
            <h1>Pairit CLI Login</h1>
            <p>Click the button below to sign in with Google. You will be redirected to a page with your session token.</p>
            <button onclick="login()" class="btn btn-blue">
                <svg class="icon" viewBox="0 0 24 24"><path d="M17.788 5.108A9 9 0 1021 12h-8"></path></svg>
                Sign in with Google
            </button>
        </div>`;

        const scriptContent = `
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
        </script>`;

        return new Response(renderPage({
            title: 'Pairit CLI Login',
            content,
            scripts: scriptContent
        }), {
            headers: { 'content-type': 'text/html' }
        });
    })
    .get('/', () => {
        const content = `
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
            <a href="${LAB_URL}" class="btn btn-primary">Go to Lab</a>
        </div>`;

        return new Response(renderPage({
            title: 'Pairit Manager',
            content
        }), {
            headers: { 'content-type': 'text/html' }
        });
    })
    .use(configsRoutes)
    .use(mediaRoutes)
    .listen(Number(process.env.PORT) || 3002);

console.log(`🚀 Manager server running on ${app.server?.hostname}:${app.server?.port}`);
