/**
 * Dotted paths such as "a.b.c" into session_state and the group view.
 * Paths can come from peers (agent tools, SSE), so segments that reach an
 * object's prototype are refused.
 */

const FORBIDDEN_SEGMENTS = new Set(["__proto__", "constructor", "prototype"]);

export function isSafePathSegment(segment: string): boolean {
	return segment.length > 0 && !FORBIDDEN_SEGMENTS.has(segment);
}

export function isSafePath(path: string): boolean {
	return path.split(".").every(isSafePathSegment);
}

function isObject(value: unknown): value is Record<string, unknown> {
	return value != null && typeof value === "object";
}

/** Reads a dotted path through own properties only. */
export function getOwnPath(root: unknown, path: string): unknown {
	let current = root;
	for (const key of path.split(".")) {
		if (!isSafePathSegment(key)) return undefined;
		if (!isObject(current) || !Object.hasOwn(current, key)) return undefined;
		current = current[key];
	}
	return current;
}

/**
 * Applies { "a.b": value } updates to a copy of base. Unsafe paths are
 * skipped.
 */
export function mergeNestedUpdates(
	base: Record<string, unknown>,
	updates: Record<string, unknown>,
): Record<string, unknown> {
	const next = structuredClone(base);
	for (const [path, value] of Object.entries(updates)) {
		if (!isSafePath(path)) continue;
		const keys = path.split(".");
		let obj: Record<string, unknown> = next;
		for (let i = 0; i < keys.length - 1; i++) {
			const key = keys[i];
			const child = Object.hasOwn(obj, key) ? obj[key] : undefined;
			if (!isObject(child)) {
				obj[key] = {};
			}
			obj = obj[key] as Record<string, unknown>;
		}
		obj[keys[keys.length - 1]] = value;
	}
	return next;
}
