/**
 * Config management routes for manager server
 * POST /configs/upload - Upload/update config
 * GET /configs - List configs (filterable by owner)
 * DELETE /configs/:configId - Delete config
 */
import { Elysia, t } from 'elysia';
import { getConfigsCollection } from '../lib/db';
import type { ConfigDocument } from '../types';

export const configsRoutes = new Elysia({ prefix: '/configs' })
    .post('/upload', async ({ body, set }) => {
        try {
            const collection = await getConfigsCollection();
            const existing = await collection.findOne({ configId: body.configId });

            const payload: Partial<ConfigDocument> = {
                configId: body.configId,
                owner: body.owner,
                checksum: body.checksum,
                metadata: body.metadata ?? null,
                config: body.config,
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
                owner: updated?.owner ?? body.owner,
                checksum: updated?.checksum ?? body.checksum,
                metadata: updated?.metadata ?? null,
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
            owner: t.String({ minLength: 1 }),
            checksum: t.String({ minLength: 1 }),
            metadata: t.Optional(t.Record(t.String(), t.Unknown())),
            config: t.Unknown()
        })
    })
    .get('/', async ({ query, set }) => {
        try {
            const collection = await getConfigsCollection();
            const cursor = query.owner
                ? collection.find({ owner: query.owner }).sort({ updatedAt: -1 })
                : collection.find({}).sort({ updatedAt: -1 });

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
    .delete('/:configId', async ({ params: { configId }, set }) => {
        try {
            const collection = await getConfigsCollection();
            const existing = await collection.findOne({ configId });
            if (!existing) {
                set.status = 404;
                return { error: 'not_found' };
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
