/**
 * Lab Server Entry Point
 * Elysia app with session and config management + Static Serving
 */
import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { staticPlugin } from '@elysiajs/static';
import { resolve } from 'node:path';
import { auth } from '../../../lib/auth';
import { configsRoutes } from './routes/configs';
import { sessionsRoutes } from './routes/sessions';
import { eventsRoutes } from './routes/events';

// Path to built frontend assets
const distPath = resolve(import.meta.dir, '../../app/dist');
console.log('Serving static assets from:', distPath);


const app = new Elysia()
    .use(
        cors({
            origin: '*',
            methods: ['GET', 'POST', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
            exposeHeaders: ['Content-Type'],
            maxAge: 86400,
        })
    )
    // Mount Better Auth handler at /api/auth/*
    .all('/api/auth/*', ({ request }) => auth.handler(request))

    // API Routes
    .use(configsRoutes)
    .use(sessionsRoutes)
    .use(eventsRoutes)

    // Static Assets
    // .use(staticPlugin({
    //     assets: distPath,
    //     prefix: '/'
    // }))

    .get('/', () => Bun.file(`${distPath}/index.html`))
    .get('/favicon.ico', () => Bun.file(`${distPath}/favicon.ico`))
    .get('/assets/*', ({ params: { '*': path } }) => Bun.file(`${distPath}/assets/${path}`))

    // Helper to catch client-side routes
    .get('*', () => Bun.file(`${distPath}/index.html`))

    .listen(Number(process.env.PORT) || 3001);

console.log(`🚀 Lab server running on ${app.server?.hostname}:${app.server?.port}`);
