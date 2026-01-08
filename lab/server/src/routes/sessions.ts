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

import { randomBytes } from 'crypto';

import { deriveAuthContext } from '../lib/auth-middleware';

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

async function saveSession(session: Session & { sessionToken?: string; userId?: string | null }): Promise<void> {
    const collection = await getSessionsCollection();
    const now = new Date();
    const doc: SessionDocument = {
        id: session.id,
        configId: session.configId,
        config: session.config,
        currentPageId: session.currentPageId,
        user_state: session.user_state,
        endedAt: session.endedAt ?? null,
        sessionToken: session.sessionToken,
        userId: session.userId ?? null,
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
    .derive(({ request, params }) => deriveAuthContext({ request, params }))
    .post('/start', async ({ body, set, requireAuth, user }) => {
        const loaded = await loadConfig(body.configId);
        if (!loaded) {
            set.status = 404;
            return { error: 'config_not_found' };
        }

        const { config } = loaded;



        let userId: string | null = null;
        if (requireAuth && user) {
            userId = user.id;
        }

        // Generate unique session token for shareable links (when auth not required)
        const sessionToken = !requireAuth ? randomBytes(32).toString('hex') : undefined;

        const id = uid();
        const session: Session & { sessionToken?: string; userId?: string | null } = {
            id,
            configId: body.configId,
            config,
            currentPageId: config.initialPageId,
            user_state: {},
            sessionToken,
            userId,
        };
        await saveSession(session);
        const page = config.pages[session.currentPageId];

        const response: any = {
            sessionId: id,
            configId: body.configId,
            currentPageId: session.currentPageId,
            page,
        };

        // Include shareable link if auth is not required
        if (!requireAuth && sessionToken) {
            response.sessionToken = sessionToken;
            response.shareableLink = `${process.env.PUBLIC_URL || 'http://localhost:3001'}/${body.configId}?token=${sessionToken}`;
        }

        return response;
    }, {
        body: t.Object({
            configId: t.String({ minLength: 1 })
        })
    })
    .get('/:id', async ({ params: { id }, query, set }) => {
        const session = await loadSession(id);
        if (!session) {
            set.status = 404;
            return { error: 'not_found' };
        }

        // Auth already validated by middleware
        // If requireAuth is true, middleware ensures we have a user session or valid token (unlikely for strict auth)
        // Actually, for strict auth, middleware ensures Better Auth session.
        // For hybrid, middleware allows token.

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
        }),
        query: t.Object({
            token: t.Optional(t.String())
        })
    })
    .post('/:id/advance', async ({ params: { id }, body, query, set }) => {
        const session = await loadSession(id);
        if (!session) {
            set.status = 404;
            return { error: 'not_found' };
        }

        // Auth handled by middleware

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
        }),
        query: t.Object({
            token: t.Optional(t.String())
        })
    });
