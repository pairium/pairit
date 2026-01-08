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

const DEFAULT_MEDIA_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
const MEDIA_UPLOAD_MAX_BYTES = Number.isFinite(Number(process.env.MEDIA_UPLOAD_MAX_BYTES))
    ? Number(process.env.MEDIA_UPLOAD_MAX_BYTES)
    : DEFAULT_MEDIA_UPLOAD_MAX_BYTES;

function estimateBase64Bytes(payload: string): number {
    const normalized = payload.replace(/\s/g, '');
    const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
    return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
}

export const mediaRoutes = new Elysia({ prefix: '/media' })
    .use(authMiddleware)
    .post('/upload', async ({ body, set, user }) => {
        if (!user) {
            set.status = 401;
            return { error: 'unauthorized', message: 'Not authenticated' };
        }

        const estimatedBytes = estimateBase64Bytes(body.data);
        if (estimatedBytes > MEDIA_UPLOAD_MAX_BYTES) {
            set.status = 413;
            return {
                error: 'payload_too_large',
                message: 'Upload exceeds server limit; use signed upload instead.',
                maxBytes: MEDIA_UPLOAD_MAX_BYTES,
            };
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
            checksum: t.Optional(t.String()),
            bucket: t.Optional(t.String()),
            contentType: t.Optional(t.Union([t.String(), t.Null()])),
            metadata: t.Optional(t.Union([t.Record(t.String(), t.Unknown()), t.Null()])),
            public: t.Optional(t.Boolean())
        })
    })
    .post('/upload-url', async ({ body, set, user }) => {
        if (!user) {
            set.status = 401;
            return { error: 'unauthorized', message: 'Not authenticated' };
        }

        if (typeof storage.getUploadUrl !== 'function') {
            set.status = 400;
            return { error: 'not_supported', message: 'Signed uploads not supported by storage backend' };
        }

        try {
            const upload = await storage.getUploadUrl(body.object, {
                contentType: body.contentType ?? undefined,
                expiresInSeconds: body.expiresInSeconds ?? 900,
            });
            const publicUrl = body.public === false
                ? undefined
                : await storage.getUrl(body.object);

            return {
                bucket: body.bucket || 'local',
                object: body.object,
                uploadUrl: upload.url,
                method: upload.method,
                headers: upload.headers ?? null,
                expiresAt: upload.expiresAt ?? null,
                publicUrl,
            };
        } catch (err) {
            if (err instanceof Error && err.message === 'not_supported') {
                set.status = 400;
                return { error: 'not_supported', message: 'Signed uploads not supported by storage backend' };
            }
            console.error('media upload-url error', err);
            set.status = 500;
            return {
                error: 'internal',
                message: err instanceof Error ? err.message : 'unknown error',
            };
        }
    }, {
        body: t.Object({
            object: t.String({ minLength: 1 }),
            bucket: t.Optional(t.String()),
            contentType: t.Optional(t.Union([t.String(), t.Null()])),
            expiresInSeconds: t.Optional(t.Number()),
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
