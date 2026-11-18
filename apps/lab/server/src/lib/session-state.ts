const FORBIDDEN_SEGMENTS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * A dotted session_state path ("a.b") that is safe to $set and to send to
 * browsers: no Mongo operators, no empty segments, and no segment that
 * reaches an object's prototype when a client applies it.
 */
export function isSafeStatePath(path: string): boolean {
	if (!path || path.includes("$")) return false;
	return path
		.split(".")
		.every((segment) => segment.length > 0 && !FORBIDDEN_SEGMENTS.has(segment));
}

/** Reads a dotted path through own properties only. */
export function getOwnPath(root: unknown, path: string): unknown {
	let current = root;
	for (const key of path.split(".")) {
		if (FORBIDDEN_SEGMENTS.has(key)) return undefined;
		if (current == null || typeof current !== "object") return undefined;
		if (!Object.hasOwn(current, key)) return undefined;
		current = (current as Record<string, unknown>)[key];
	}
	return current;
}

// MongoDB rejects one $set that touches both "a" and "a.b".
export function hasOverlappingPaths(paths: string[]): boolean {
	const sorted = [...paths].sort();
	for (let i = 1; i < sorted.length; i++) {
		if (sorted[i].startsWith(`${sorted[i - 1]}.`)) return true;
	}
	return false;
}

// Written only by the server (matchmaking, randomization, chat, agent tools).
// Old clients still echo some of these after a match, so they are dropped,
// not rejected.
export const PROTECTED_STATE_KEYS = [
	"group_id",
	"chat_group_id",
	"treatment",
	"chat_ended",
	"deal_reached",
	"agreed_price",
	"chat",
];

/**
 * Splits client updates into allowed and ignored paths. A path is ignored if
 * it is a protected key, under one, or a parent of one.
 */
export function filterProtectedUpdates(
	updates: Record<string, unknown>,
	protectedKeys: Iterable<string>,
): { allowed: Record<string, unknown>; ignored: string[] } {
	const keys = [...protectedKeys];
	const allowed: Record<string, unknown> = {};
	const ignored: string[] = [];
	for (const [path, value] of Object.entries(updates)) {
		const blocked = keys.some(
			(key) =>
				path === key ||
				path.startsWith(`${key}.`) ||
				key.startsWith(`${path}.`),
		);
		if (blocked) ignored.push(path);
		else allowed[path] = value;
	}
	return { allowed, ignored };
}
