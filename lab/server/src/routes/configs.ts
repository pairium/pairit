/**
 * Config routes for lab server
 * GET /configs/:configId - Fetch config from MongoDB or local fallback
 */
import { Elysia, t } from 'elysia';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getConfigsCollection } from '../lib/db';
import type { Config, ConfigDocument } from '../types';

function isPage(value: unknown): value is { id: string; end?: boolean; components?: unknown[] } {
    if (!value || typeof value !== 'object') return false;
    const page = value as any;
    if (typeof page.id !== 'string') return false;
    if (page.components && !Array.isArray(page.components)) return false;
    return true;
}

function coerceConfig(raw: unknown): Config | null {
    if (!raw || typeof raw !== 'object') return null;
    const config = raw as Partial<Config> & {
        initialPageId?: unknown;
        nodes?: unknown;
    };

    const initialPageId =
        typeof config.initialPageId === 'string'
            ? config.initialPageId
            : null;

    if (!initialPageId) return null;

    const pagesInput: unknown = config.pages ?? config.nodes;

    if (!pagesInput || (typeof pagesInput !== 'object' && !Array.isArray(pagesInput))) {
        return null;
    }

    const pages: Record<string, any> = {};

    if (Array.isArray(pagesInput)) {
        for (const entry of pagesInput) {
            if (!isPage(entry)) return null;
            pages[entry.id] = entry;
        }
    } else {
        for (const [key, value] of Object.entries(pagesInput)) {
            if (!isPage(value)) return null;
            pages[key] = value;
        }
    }

    if (!pages[initialPageId]) return null;

    return { initialPageId, pages };
}

async function loadConfig(configId: string): Promise<{ config: Config; doc: ConfigDocument } | null> {
    // First try to load from MongoDB
    const collection = await getConfigsCollection();
    const data = await collection.findOne({ configId });

    if (data && typeof data.config !== 'undefined') {
        const config = coerceConfig(data.config);
        if (config) {
            return {
                config,
                doc: {
                    configId: data.configId ?? configId,
                    owner: data.owner,
                    checksum: data.checksum,
                    metadata: data.metadata,
                    config: data.config,
                    createdAt: data.createdAt ?? null,
                    updatedAt: data.updatedAt ?? null,
                },
            };
        }
    }

    // Fallback: try to load from local configs directory (for development)
    try {
        const configsDir = join(process.cwd(), '../app/public/configs');
        const configPath = join(configsDir, `${configId}.json`);
        const configContent = await readFile(configPath, 'utf8');
        const raw = JSON.parse(configContent);
        const config = coerceConfig(raw);
        if (config) {
            return {
                config,
                doc: {
                    configId,
                    owner: 'local',
                    checksum: undefined,
                    metadata: null,
                    config: raw,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            };
        }
    } catch (error) {
        console.log(`Local config fallback failed for ${configId}:`, error);
    }

    return null;
}

export const configsRoutes = new Elysia({ prefix: '/configs' })
    .get('/:configId', async ({ params: { configId }, set }) => {
        if (!configId) {
            set.status = 400;
            return { error: 'missing_config_id' };
        }

        try {
            const loaded = await loadConfig(configId);
            if (!loaded) {
                set.status = 404;
                return { error: 'config_not_found' };
            }

            const { doc } = loaded;
            return {
                configId: doc.configId,
                owner: doc.owner ?? null,
                checksum: doc.checksum ?? null,
                metadata: doc.metadata ?? null,
                config: loaded.config,
                createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : null,
                updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : null,
            };
        } catch (err) {
            console.error('config fetch error', err);
            set.status = 500;
            return { error: 'internal' };
        }
    }, {
        params: t.Object({
            configId: t.String({ minLength: 1 })
        })
    });
