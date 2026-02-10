/**
 * Session routes for lab server
 * POST /sessions/start - Create new session
 * GET /sessions/:id - Get session state
 * POST /sessions/:id/advance - Advance to next page
 */

// Import the loadConfig function (duplicated from configs.ts for now)
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Elysia, t } from "elysia";
import { getConfigsCollection, getSessionsCollection } from "../lib/db";
import type {
	Config,
	ProlificParams,
	Session,
	SessionDocument,
} from "../types";

const IS_DEV = process.env.NODE_ENV === "development";
const FORCE_AUTH = process.env.FORCE_AUTH === "true";

import { randomUUID } from "node:crypto";

import { deriveAuthContext } from "../lib/auth-middleware";

function isPage(
	value: unknown,
): value is { id: string; end?: boolean; components?: unknown[] } {
	if (!value || typeof value !== "object") return false;
	const page = value as any;
	if (typeof page.id !== "string") return false;
	if (page.components && !Array.isArray(page.components)) return false;
	return true;
}

function coerceConfig(raw: unknown): Config | null {
	if (!raw || typeof raw !== "object") return null;
	const config = raw as Partial<Config> & {
		initialPageId?: unknown;
		nodes?: unknown;
	};
	const initialPageId =
		typeof config.initialPageId === "string" ? config.initialPageId : null;
	if (!initialPageId) return null;
	const pagesInput: unknown = config.pages ?? config.nodes;
	if (
		!pagesInput ||
		(typeof pagesInput !== "object" && !Array.isArray(pagesInput))
	)
		return null;
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

async function loadConfig(
	configId: string,
): Promise<{ config: Config } | null> {
	const collection = await getConfigsCollection();
	const data = await collection.findOne({ configId });
	if (data && typeof data.config !== "undefined") {
		const config = coerceConfig(data.config);
		if (config) return { config };
	}
	// Fallback: local configs directory (development only)
	if (IS_DEV) {
		try {
			const configsDir = resolve(process.cwd(), "../app/public/configs");
			const configPath = resolve(configsDir, `${configId}.json`);

			// Prevent path traversal attacks
			if (!configPath.startsWith(configsDir)) {
				console.warn(`[Config] Path traversal attempt blocked: ${configId}`);
				return null;
			}

			const configContent = await readFile(configPath, "utf8");
			const raw = JSON.parse(configContent);
			const config = coerceConfig(raw);
			if (config) return { config };
		} catch (error) {
			console.log(`Local config fallback failed for ${configId}:`, error);
		}
	}
	return null;
}

function uid(): string {
	return randomUUID();
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
		prolific: data.prolific ?? null,
		endedAt: data.endedAt ?? undefined,
		createdAt: data.createdAt,
		updatedAt: data.updatedAt,
	};
}

async function saveSession(
	session: Session & { userId?: string | null },
): Promise<void> {
	const collection = await getSessionsCollection();
	const now = new Date();
	const doc: SessionDocument = {
		id: session.id,
		configId: session.configId,
		config: session.config,
		currentPageId: session.currentPageId,
		user_state: session.user_state,
		prolific: session.prolific ?? null,
		endedAt: session.endedAt ?? null,
		userId: session.userId ?? null,
		createdAt: session.createdAt ?? now,
		updatedAt: now,
	};
	await collection.updateOne(
		{ id: session.id },
		{ $set: doc },
		{ upsert: true },
	);
}

export const sessionsRoutes = new Elysia({ prefix: "/sessions" })
	.derive(({ request, params }) => deriveAuthContext({ request, params }))
	.post(
		"/start",
		async ({ body, set, requireAuth, user }) => {
			// Enforce auth requirement (FORCE_AUTH=true bypasses config check for testing)
			if ((requireAuth || FORCE_AUTH) && !user) {
				set.status = 401;
				return { error: "authentication_required" };
			}

			const loaded = await loadConfig(body.configId);
			if (!loaded) {
				set.status = 404;
				return { error: "config_not_found" };
			}

			const { config } = loaded;

			// For authenticated configs, store the user ID
			const userId = requireAuth && user ? user.id : null;

			const prolific: ProlificParams | null = body.prolific ?? null;

			const id = uid();
			const session: Session & { userId?: string | null } = {
				id,
				configId: body.configId,
				config,
				currentPageId: config.initialPageId,
				user_state: {},
				prolific,
				userId,
			};
			await saveSession(session);
			const page = config.pages[session.currentPageId];

			return {
				sessionId: id,
				configId: body.configId,
				currentPageId: session.currentPageId,
				page,
			};
		},
		{
			body: t.Object({
				configId: t.String({ minLength: 1 }),
				prolific: t.Optional(
					t.Object({
						prolificPid: t.String(),
						studyId: t.String(),
						sessionId: t.String(),
					}),
				),
			}),
		},
	)
	.get(
		"/:id",
		async ({ params: { id }, set }) => {
			const session = await loadSession(id);
			if (!session) {
				set.status = 404;
				return { error: "not_found" };
			}

			// Session existence = authorization (Qualtrics model)
			// Only someone who started the session knows the UUID

			const page = session.config.pages[session.currentPageId];
			return {
				sessionId: session.id,
				configId: session.configId,
				currentPageId: session.currentPageId,
				page,
				endedAt: session.endedAt ?? null,
			};
		},
		{
			params: t.Object({
				id: t.String(),
			}),
		},
	)
	.post(
		"/:id/advance",
		async ({ params: { id }, body, set }) => {
			const session = await loadSession(id);
			if (!session) {
				set.status = 404;
				return { error: "not_found" };
			}

			// Session existence = authorization (Qualtrics model)

			session.currentPageId = body.target;

			// In hybrid mode, we don't validate page existence since frontend manages its own config
			const page = session.config.pages[body.target] || {
				id: body.target,
				components: [],
			};

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
		},
		{
			params: t.Object({
				id: t.String(),
			}),
			body: t.Object({
				target: t.String({ minLength: 1 }),
			}),
		},
	);
