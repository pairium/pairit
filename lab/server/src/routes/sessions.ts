/**
 * Session routes for lab server
 * POST /sessions/start - Create new session
 * GET /sessions/:id - Get session state
 * POST /sessions/:id/advance - Advance to next page
 */
import { Elysia, t } from 'elysia';
import { getSessionsCollection } from '../lib/db';
import type { Session, SessionDocument, Config } from '../types';

// Import the loadConfig function (duplicated from configs.ts for now)
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getConfigsCollection } from '../lib/db';

function isPage(value: unknown): value is { id: string; end?: boolean; components?: unknown[] } {
    if (!value || typeof value !== 'object') return false;
    const page = value as any;
    if (typeof page.id !== 'string') return false;
    if (page.components && !Array.isArray(page.components)) return false;
    return true;
}

function coerceConfig(raw: unknown): Config | null {
    if (!raw || typeof raw !== 'object') return null;
    const config = raw as Partial<Config> & { initialPageId?: unknown; nodes?: unknown };
    const initialPageId = typeof config.initialPageId === 'string' ? config.initialPageId : null;
    if (!initialPageId) return null;
    const pagesInput: unknown = config.pages ?? config.nodes;
    if (!pagesInput || (typeof pagesInput !== 'object' && !Array.isArray(pagesInput))) return null;
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

async function loadConfig(configId: string): Promise<{ config: Config } | null> {
    const collection = await getConfigsCollection();
    const data = await collection.findOne({ configId });
    if (data && typeof data.config !== 'undefined') {
        const config = coerceConfig(data.config);
        if (config) return { config };
    }
    try {
        const configsDir = join(process.cwd(), '../app/public/configs');
        const configPath = join(configsDir, `${configId}.json`);
        const configContent = await readFile(configPath, 'utf8');
        const raw = JSON.parse(configContent);
        const config = coerceConfig(raw);
        if (config) return { config };
    } catch (error) {
        console.log(`Local config fallback failed for ${configId}:`, error);
    }
    return null;
}

function uid(): string {
    return Math.random().toString(36).slice(2, 10);
}

async function loadSession(sessionId: string): Promise<Session | null> {
    const collection = await getSessionsCollection();
    const data = await collection.findOne({ id: sessionId });
    if (!data) return null;
    return {
        id: data.id,
        configId: data.configId,
        config: data.config,
        currentPageId: data.currentPageId,
        user_state: data.user_state,
        endedAt: data.endedAt ?? undefined,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
    };
}

async function saveSession(session: Session): Promise<void> {
    const collection = await getSessionsCollection();
    const now = new Date();
    const doc: SessionDocument = {
        id: session.id,
        configId: session.configId,
        config: session.config,
        currentPageId: session.currentPageId,
        user_state: session.user_state,
        endedAt: session.endedAt ?? null,
        createdAt: session.createdAt ?? now,
        updatedAt: now,
    };
    await collection.updateOne(
        { id: session.id },
        { $set: doc },
        { upsert: true }
    );
}

export const sessionsRoutes = new Elysia({ prefix: '/sessions' })
    .post('/start', async ({ body, set }) => {
        const loaded = await loadConfig(body.configId);
        if (!loaded) {
            set.status = 404;
            return { error: 'config_not_found' };
        }

        const { config } = loaded;
        const id = uid();
        const session: Session = {
            id,
            configId: body.configId,
            config,
            currentPageId: config.initialPageId,
            user_state: {},
        };
        await saveSession(session);
        const page = config.pages[session.currentPageId];
        return {
            sessionId: id,
            configId: body.configId,
            currentPageId: session.currentPageId,
            page,
        };
    }, {
        body: t.Object({
            configId: t.String({ minLength: 1 })
        })
    })
    .get('/:id', async ({ params: { id }, set }) => {
        const session = await loadSession(id);
        if (!session) {
            set.status = 404;
            return { error: 'not_found' };
        }
        const page = session.config.pages[session.currentPageId];
        return {
            sessionId: session.id,
            configId: session.configId,
            currentPageId: session.currentPageId,
            page,
            endedAt: session.endedAt ?? null,
        };
    }, {
        params: t.Object({
            id: t.String()
        })
    })
    .post('/:id/advance', async ({ params: { id }, body, set }) => {
        const session = await loadSession(id);
        if (!session) {
            set.status = 404;
            return { error: 'not_found' };
        }

        session.currentPageId = body.target;

        // In hybrid mode, we don't validate page existence since frontend manages its own config
        const page = session.config.pages[body.target] || { id: body.target, components: [] };

        if (page.end) {
            session.endedAt = new Date().toISOString();
        }
        await saveSession(session);
        return {
            sessionId: session.id,
            configId: session.configId,
            currentPageId: session.currentPageId,
            page,
            endedAt: session.endedAt ?? null,
        };
    }, {
        params: t.Object({
            id: t.String()
        }),
        body: t.Object({
            target: t.String({ minLength: 1 })
        })
    });
