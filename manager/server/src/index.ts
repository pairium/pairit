/**
 * Manager Server Entry Point
 * Elysia app with config and media management
 */
import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
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
    .get('/', () => ({ message: 'Pairit manager API' }))
    .use(configsRoutes)
    .use(mediaRoutes)
    .listen(Number(process.env.PORT) || 3002);

console.log(`🚀 Manager server running on ${app.server?.hostname}:${app.server?.port}`);
