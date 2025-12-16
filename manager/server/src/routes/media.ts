/**
 * Media management routes for manager server
 * POST /media/upload - Upload media file
 * GET /media - List media files
 * DELETE /media/:object - Delete media file
 */
import { Elysia, t } from 'elysia';
import { authMiddleware } from '../lib/auth-middleware';
import { storage } from '../../../../lib/storage';
import type { MediaListItem } from '../types';

export const mediaRoutes = new Elysia({ prefix: '/media' })
    .use(authMiddleware)
    .post('/upload', async ({ body, set, user }) => {
        if (!user) {
            set.status = 401;
            return { error: 'unauthorized', message: 'Not authenticated' };
        }

        let buffer: Buffer;
        try {
            buffer = Buffer.from(body.data, 'base64');
        } catch (err) {
            console.error('media upload base64 decode error', err);
            set.status = 400;
            return {
                error: 'invalid_data',
                message: 'unable to decode base64 data',
            };
        }

        try {
            // Upload to storage backend
            await storage.put(body.object, buffer);

            // Get public URL
            const publicUrl = await storage.getUrl(body.object);

            return {
                bucket: body.bucket || 'local',
                object: body.object,
                size: buffer.length,
                contentType: body.contentType ?? null,
                updatedAt: new Date().toISOString(),
                checksum: null,
                publicUrl: body.public !== false ? publicUrl : undefined,
                metadata: body.metadata ?? null,
            };
        } catch (err) {
            console.error('media upload error', err);
            set.status = 500;
            return {
                error: 'internal',
                message: err instanceof Error ? err.message : 'unknown error',
            };
        }
    }, {
        body: t.Object({
            object: t.String({ minLength: 1 }),
            data: t.String({ minLength: 1 }),
            bucket: t.Optional(t.String()),
            contentType: t.Optional(t.String()),
            metadata: t.Optional(t.Record(t.String(), t.Unknown())),
            public: t.Optional(t.Boolean())
        })
    })
    .get('/', async ({ query, set, user }) => {
        if (!user) {
            set.status = 401;
            return { error: 'unauthorized', message: 'Not authenticated' };
        }

        try {
            const files = await storage.list(query.prefix);

            const objects: MediaListItem[] = files.map((name: string) => ({
                name,
                bucket: 'local',
                size: undefined,
                updatedAt: null,
                contentType: null,
                publicUrl: undefined,
                metadata: null,
            }));

            return { objects };
        } catch (err) {
            console.error('media list error', err);
            set.status = 500;
            return {
                error: 'internal',
                message: err instanceof Error ? err.message : 'unknown error',
            };
        }
    }, {
        query: t.Object({
            prefix: t.Optional(t.String())
        })
    })
    .delete('/:object', async ({ params: { object }, set, user }) => {
        if (!user) {
            set.status = 401;
            return { error: 'unauthorized', message: 'Not authenticated' };
        }

        try {
            const exists = await storage.exists(object);
            if (!exists) {
                set.status = 404;
                return { error: 'not_found' };
            }

            await storage.delete(object);
            return { bucket: 'local', object };
        } catch (err) {
            console.error('media delete error', err);
            set.status = 500;
            return {
                error: 'internal',
                message: err instanceof Error ? err.message : 'unknown error',
            };
        }
    }, {
        params: t.Object({
            object: t.String()
        })
    });

