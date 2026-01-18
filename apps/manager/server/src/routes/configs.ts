/**
 * Config management routes for manager server
 * POST /configs/upload - Upload/update config
 * GET /configs - List configs (filterable by owner)
 * DELETE /configs/:configId - Delete config
 */
import { Elysia, t } from 'elysia';
import { authMiddleware } from '../lib/auth-middleware';
import { getConfigsCollection } from '../lib/db';
import type { ConfigDocument } from '../types';

export const configsRoutes = new Elysia({ prefix: '/configs' })
    .use(authMiddleware)
    .post('/upload', async (context) => {
        const { body, set, user } = context;

        if (!user) {
            set.status = 401;
            return { error: 'unauthorized', message: 'Not authenticated' };
        }

        try {
            const collection = await getConfigsCollection();
            const existing = await collection.findOne({ configId: body.configId });

            // Ownership check: prevent overwriting another user's config
            if (existing && existing.owner !== user.id) {
                set.status = 403;
                return { error: 'forbidden', message: 'Cannot modify config owned by another user' };
            }

            const payload: Partial<ConfigDocument> = {
                configId: body.configId,
                owner: user.id, // Auto-populate from authenticated user
                checksum: body.checksum,
                metadata: body.metadata ?? null,
                config: body.config,
                requireAuth: body.requireAuth ?? true, // Default to true
                updatedAt: new Date(),
            };

            if (!existing) {
                payload.createdAt = new Date();
            }

            await collection.updateOne(
                { configId: body.configId },
                { $set: payload },
                { upsert: true }
            );

            const updated = await collection.findOne({ configId: body.configId });
            return {
                configId: updated?.configId ?? body.configId,
                owner: updated?.owner ?? user.id,
                checksum: updated?.checksum ?? body.checksum,
                metadata: updated?.metadata ?? null,
                requireAuth: updated?.requireAuth ?? true,
                updatedAt: updated?.updatedAt instanceof Date ? updated.updatedAt.toISOString() : null,
                createdAt: updated?.createdAt instanceof Date ? updated.createdAt.toISOString() : null,
            };
        } catch (err) {
            console.error('upload error', err);
            set.status = 500;
            return {
                error: 'internal',
                message: err instanceof Error ? err.message : 'unknown error',
            };
        }
    }, {
        body: t.Object({
            configId: t.String({ minLength: 1 }),
            owner: t.Optional(t.String()),
            checksum: t.String({ minLength: 1 }),
            metadata: t.Optional(t.Union([t.Record(t.String(), t.Unknown()), t.Null()])),
            config: t.Unknown(),
            requireAuth: t.Optional(t.Boolean())
        })
    })
    .get('/', async ({ query, set, user }) => {

        if (!user) {
            set.status = 401;
            return { error: 'unauthorized', message: 'Not authenticated' };
        }

        try {
            const collection = await getConfigsCollection();
            // Ownership filter: only show configs owned by authenticated user
            // The owner query param is ignored - always filter by authenticated user
            const cursor = collection.find({ owner: user.id }).sort({ updatedAt: -1 });

            const items = await cursor.toArray();
            const configs = items.map((data) => ({
                configId: data.configId,
                owner: data.owner,
                checksum: data.checksum,
                updatedAt: data.updatedAt instanceof Date ? data.updatedAt.toISOString() : null,
                metadata: data.metadata ?? null,
            }));

            return { configs };
        } catch (err) {
            console.error('list error', err);
            set.status = 500;
            return {
                error: 'internal',
                message: err instanceof Error ? err.message : 'unknown error',
            };
        }
    }, {
        query: t.Object({
            owner: t.Optional(t.String())
        })
    })
    .delete('/:configId', async ({ params: { configId }, set, user }) => {

        if (!user) {
            set.status = 401;
            return { error: 'unauthorized', message: 'Not authenticated' };
        }

        try {
            const collection = await getConfigsCollection();
            const existing = await collection.findOne({ configId });
            if (!existing) {
                set.status = 404;
                return { error: 'not_found' };
            }

            // Ownership check: only allow deleting own configs
            if (existing.owner !== user.id) {
                set.status = 403;
                return { error: 'forbidden', message: 'Cannot delete config owned by another user' };
            }

            await collection.deleteOne({ configId });
            return { configId };
        } catch (err) {
            console.error('delete error', err);
            set.status = 500;
            return {
                error: 'internal',
                message: err instanceof Error ? err.message : 'unknown error',
            };
        }
    }, {
        params: t.Object({
            configId: t.String()
        })
    });
