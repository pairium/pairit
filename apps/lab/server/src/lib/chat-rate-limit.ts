/**
 * Per-session limits on chat sends and agent starts. Each one can trigger
 * LLM calls billed to the researcher, so a participant can't loop them.
 */

export const CHAT_PER_MINUTE = 20;
export const CHAT_PER_SESSION = 300;
const WINDOW_MS = 60_000;

const recent = new Map<string, number[]>();

/**
 * Records one request for the session unless it is over a limit.
 * `lifetimeCount` is how many the session has already sent in total.
 */
export function takeChatSlot(
	sessionId: string,
	lifetimeCount: number,
	now = Date.now(),
): { ok: true } | { ok: false; reason: "per_minute" | "per_session" } {
	if (lifetimeCount >= CHAT_PER_SESSION) {
		return { ok: false, reason: "per_session" };
	}
	const times = (recent.get(sessionId) ?? []).filter(
		(t) => now - t < WINDOW_MS,
	);
	if (times.length >= CHAT_PER_MINUTE) {
		recent.set(sessionId, times);
		return { ok: false, reason: "per_minute" };
	}
	times.push(now);
	recent.set(sessionId, times);
	return { ok: true };
}

// Drop idle sessions so the map doesn't grow without bound
setInterval(() => {
	const now = Date.now();
	for (const [sessionId, times] of recent) {
		if (times.every((t) => now - t >= WINDOW_MS)) recent.delete(sessionId);
	}
}, WINDOW_MS).unref?.();

export function resetChatRateLimits(): void {
	recent.clear();
}
