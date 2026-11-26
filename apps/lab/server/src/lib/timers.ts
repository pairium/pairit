/**
 * Server-backed timer manager
 * Persists timer deadlines in MongoDB (first-writer-wins) and broadcasts
 * `timer_expired` over SSE so minimized/throttled tabs advance on time.
 */

import { MongoServerError } from "mongodb";
import type { TimerDocument } from "../types";
import type { TimerScope, TimerSettings } from "./config-lookup";
import { getTimersCollection } from "./db";
import { getGroupMembers } from "./groups";
import { broadcastToSession } from "./sse";

export type TimerSessionContext = {
	id: string;
	configId: string;
	session_state?: Record<string, unknown>;
};

export type StartTimerResult = {
	timerKey: string;
	startedAt: number;
	expiresAt: number;
	serverNow: number;
	duration: number;
	scope: TimerScope;
};

export type TimerDeps = {
	claimTimer(doc: TimerDocument): Promise<TimerDocument>;
	deleteSessionPageTimers(sessionId: string, pageId: string): Promise<string[]>;
	getGroupMembers(groupId: string): Promise<string[]>;
	broadcast(sessionId: string, event: string, data: unknown): void;
	now(): number;
};

const DUPLICATE_KEY_ERROR = 11000;

const mongoDeps: TimerDeps = {
	async claimTimer(doc) {
		const collection = await getTimersCollection();
		try {
			const result = await collection.findOneAndUpdate(
				{ scopeKey: doc.scopeKey, timerKey: doc.timerKey },
				{ $setOnInsert: doc },
				{ upsert: true, returnDocument: "after" },
			);
			if (result) return result;
		} catch (error) {
			// Concurrent upserts for the same (scopeKey, timerKey) can race on the
			// unique index; read back the winner.
			if (
				!(
					error instanceof MongoServerError &&
					error.code === DUPLICATE_KEY_ERROR
				)
			) {
				throw error;
			}
		}
		const existing = await collection.findOne({
			scopeKey: doc.scopeKey,
			timerKey: doc.timerKey,
		});
		return existing ?? doc;
	},
	async deleteSessionPageTimers(sessionId, pageId) {
		const collection = await getTimersCollection();
		const scopeKey = `session:${sessionId}`;
		const docs = await collection
			.find({ scopeKey, pageId }, { projection: { timerKey: 1 } })
			.toArray();
		if (docs.length === 0) return [];
		await collection.deleteMany({ scopeKey, pageId });
		return docs.map((d) => d.timerKey);
	},
	getGroupMembers,
	broadcast: broadcastToSession,
	now: () => Date.now(),
};

type ScheduledTimer = {
	timeout: ReturnType<typeof setTimeout>;
	expiresAtMs: number;
};

// Map<`${scopeKey}::${timerKey}`, ScheduledTimer>
const scheduledTimers = new Map<string, ScheduledTimer>();

function scheduleKey(scopeKey: string, timerKey: string): string {
	return `${scopeKey}::${timerKey}`;
}

export function computeTimerKey(
	pageId: string,
	componentId: string,
	key?: string,
): string {
	return key ? `key:${key}` : `page:${pageId}:${componentId}`;
}

function scheduleExpiryBroadcast(
	scopeKey: string,
	timerKey: string,
	scope: TimerScope,
	sessionId: string,
	groupId: string | null,
	expiresAtMs: number,
	deps: TimerDeps,
): void {
	const key = scheduleKey(scopeKey, timerKey);
	if (scheduledTimers.has(key)) return;

	const delayMs = expiresAtMs - deps.now();
	if (delayMs <= 0) return;

	const timeout = setTimeout(async () => {
		scheduledTimers.delete(key);
		try {
			const members =
				scope === "group" && groupId
					? await deps.getGroupMembers(groupId)
					: [sessionId];
			const recipients = members.length > 0 ? members : [sessionId];
			const payload = { timerKey, expiresAt: expiresAtMs };
			for (const sid of recipients) {
				deps.broadcast(sid, "timer_expired", payload);
			}
		} catch (error) {
			console.error(
				`[Timer] Failed to broadcast expiry for ${scopeKey} (${timerKey}):`,
				error,
			);
		}
	}, delayMs);

	scheduledTimers.set(key, { timeout, expiresAtMs });
}

/**
 * Start a timer (or return its existing deadline).
 * - `scope: "session"`: persists across reloads; cleared when advancing off the page (unless keyed).
 * - `scope: "group"`: first group member to arrive sets the deadline for the whole group;
 *   falls back to session scope if the session has no group yet.
 */
export async function startOrGetTimer(
	session: TimerSessionContext,
	pageId: string,
	settings: TimerSettings,
	deps: TimerDeps = mongoDeps,
): Promise<StartTimerResult> {
	const rawGroupId = session.session_state?.group_id;
	const groupId =
		typeof rawGroupId === "string" && rawGroupId.length > 0 ? rawGroupId : null;

	const effectiveScope: TimerScope =
		settings.scope === "group" && groupId ? "group" : "session";
	const scopeKey =
		effectiveScope === "group" && groupId
			? `group:${groupId}`
			: `session:${session.id}`;
	const timerKey = computeTimerKey(pageId, settings.componentId, settings.key);

	const nowMs = deps.now();
	const candidate: TimerDocument = {
		scopeKey,
		timerKey,
		configId: session.configId,
		scope: effectiveScope,
		...(effectiveScope === "session" && !settings.key ? { pageId } : {}),
		duration: settings.duration,
		startedAt: new Date(nowMs),
		expiresAt: new Date(nowMs + settings.duration * 1000),
	};

	const doc = await deps.claimTimer(candidate);
	const expiresAtMs = doc.expiresAt.getTime();
	const serverNow = deps.now();

	if (expiresAtMs > serverNow) {
		scheduleExpiryBroadcast(
			scopeKey,
			timerKey,
			effectiveScope,
			session.id,
			groupId,
			expiresAtMs,
			deps,
		);
	}

	return {
		timerKey,
		startedAt: doc.startedAt.getTime(),
		expiresAt: expiresAtMs,
		serverNow,
		duration: doc.duration,
		scope: doc.scope,
	};
}

/**
 * Clear unkeyed session-scoped timers when a session advances off `pageId`,
 * so revisiting a page in a loop starts a fresh countdown.
 */
export async function clearSessionPageTimers(
	sessionId: string,
	pageId: string,
	deps: TimerDeps = mongoDeps,
): Promise<void> {
	const scopeKey = `session:${sessionId}`;
	const timerKeys = await deps.deleteSessionPageTimers(sessionId, pageId);
	for (const timerKey of timerKeys) {
		const key = scheduleKey(scopeKey, timerKey);
		const scheduled = scheduledTimers.get(key);
		if (scheduled) {
			clearTimeout(scheduled.timeout);
			scheduledTimers.delete(key);
		}
	}
}

/** Cancel all in-memory timer broadcasts (for tests). */
export function cancelAllScheduledTimers(): void {
	for (const entry of scheduledTimers.values()) {
		clearTimeout(entry.timeout);
	}
	scheduledTimers.clear();
}
