/**
 * Lab Server Entry Point
 * Elysia app with session and config management + Static Serving
 */
import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { resolve } from 'node:path';
import { auth } from '../../../lib/auth';
import { configsRoutes } from './routes/configs';
import { sessionsRoutes } from './routes/sessions';
import { eventsRoutes } from './routes/events';

const IS_DEV = process.env.NODE_ENV === 'development';
const ALLOWED_ORIGINS = process.env.CORS_ORIGINS?.split(',').map(s => s.trim()) || ['*'];

// Use process.cwd() which is safer in Docker (WORKDIR /app/lab/server)
const distPath = resolve(process.cwd(), '../app/dist');
console.log('Serving static assets from:', distPath);

const app = new Elysia()
    .use(
        cors({
            origin: IS_DEV ? '*' : ALLOWED_ORIGINS,
            methods: ['GET', 'POST', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
            exposeHeaders: ['Content-Type'],
            maxAge: 86400,
        })
    );

// Debug endpoints only available in non-production
if (IS_DEV) {
    app.get('/debug-fs', async () => {
        try {
            const fs = await import('node:fs/promises');
            const configsPath = `${distPath}/configs`;
            const files = await fs.readdir(configsPath).catch(err => [`Error reading ${configsPath}: ${err.message}`]);
            const rootFiles = await fs.readdir(distPath).catch(err => [`Error reading ${distPath}: ${err.message}`]);

            return {
                cwd: process.cwd(),
                importMetaDir: import.meta.dir,
                distPath,
                configsError: null,
                configs: files,
                rootDist: rootFiles
            };
        } catch (e) {
            return { error: e instanceof Error ? e.message : String(e) };
        }
    });
}

app
    // Mount Better Auth handler at /api/auth/*
    .all('/api/auth/*', ({ request }) => auth.handler(request))

    // API Routes
    .use(configsRoutes)
    .use(sessionsRoutes)
    .use(eventsRoutes)

    .get('/', () => Bun.file(`${distPath}/index.html`))
    .get('/favicon.ico', () => Bun.file(`${distPath}/favicon.ico`))
    .get('/assets/*', ({ params: { '*': path } }) => Bun.file(`${distPath}/assets/${path}`))
    .get('/static-configs/*', ({ params: { '*': path } }) => Bun.file(`${distPath}/configs/${path}`))

    // Helper to catch client-side routes
    .get('*', () => Bun.file(`${distPath}/index.html`))

    .listen(Number(process.env.PORT) || 3001);

console.log(`🚀 Lab server running on ${app.server?.hostname}:${app.server?.port}`);
