/**
 * Lab Server Entry Point
 * Elysia app with session and config management
 */
import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { auth } from '../../../lib/auth';
import { configsRoutes } from './routes/configs';
import { sessionsRoutes } from './routes/sessions';
import { eventsRoutes } from './routes/events';

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
    .get('/', () => ({ message: 'Pairit lab API' }))
    .use(configsRoutes)
    .use(sessionsRoutes)
    .use(eventsRoutes)
    .listen(Number(process.env.PORT) || 3001);

console.log(`🚀 Lab server running on ${app.server?.hostname}:${app.server?.port}`);
