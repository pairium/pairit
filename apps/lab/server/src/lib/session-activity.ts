import { getSessionsCollection } from "./db";

const ACTIVITY_TOUCH_INTERVAL_MS = 60_000;
const MAX_TOUCHED_SESSIONS = 10_000;
const lastActivityTouch = new Map<string, number>();

/**
 * Returns true if `sessionId` has not been touched within `intervalMs` and
 * records `nowMs`, evicting the oldest entry if the cache hits `maxEntries`.
 */
export function shouldTouchSessionActivity(
	sessionId: string,
	nowMs = Date.now(),
	intervalMs = ACTIVITY_TOUCH_INTERVAL_MS,
	maxEntries = MAX_TOUCHED_SESSIONS,
): boolean {
	const last = lastActivityTouch.get(sessionId);
	if (last !== undefined && nowMs - last < intervalMs) {
		return false;
	}
	lastActivityTouch.delete(sessionId);
	lastActivityTouch.set(sessionId, nowMs);
	if (lastActivityTouch.size > maxEntries) {
		const oldest = lastActivityTouch.keys().next().value;
		if (oldest !== undefined) lastActivityTouch.delete(oldest);
	}
	return true;
}

export function resetActivityTouchCache(): void {
	lastActivityTouch.clear();
}

/**
 * Bump `updatedAt` on an unfinished session so admin activity reports reflect
 * live participants who are reading, firing events, syncing timers, or holding
 * an open SSE stream. Throttled to once per minute per session to avoid write
 * amplification from high-frequency event bursts.
 */
export async function touchSessionActivity(sessionId: string): Promise<void> {
	const nowMs = Date.now();
	if (!shouldTouchSessionActivity(sessionId, nowMs)) return;
	try {
		const collection = await getSessionsCollection();
		await collection.updateOne(
			{ id: sessionId, endedAt: null },
			{ $set: { updatedAt: new Date(nowMs) } },
		);
	} catch (error) {
		lastActivityTouch.delete(sessionId);
		throw error;
	}
}
