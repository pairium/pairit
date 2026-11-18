/**
 * CSRF guard for cookie-authenticated, state-changing manager requests.
 *
 * Calling auth.api.getSession() directly skips Better Auth's own origin check,
 * so routes behind authMiddleware check it here. A request that carries a
 * session cookie and changes state (anything but GET/HEAD/OPTIONS) must come
 * from a trusted origin: its Origin header, or its Referer when Origin is
 * absent. The CLI sends `Origin: <manager URL>`, which is trusted. Requests
 * without a session cookie are not cookie-authenticated and pass through; the
 * routes reject them as unauthenticated.
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const SESSION_COOKIE = /(?:^|;\s*)(?:__Secure-)?better-auth\.session_token=/;

export function normalizeOrigins(origins: Iterable<string>): Set<string> {
	const out = new Set<string>();
	for (const raw of origins) {
		const origin = originOf(raw.trim());
		if (origin) out.add(origin);
	}
	return out;
}

function originOf(raw: string | null): string | null {
	if (!raw || raw === "null") return null;
	try {
		const url = new URL(raw);
		if (url.protocol !== "http:" && url.protocol !== "https:") return null;
		return url.origin;
	} catch {
		return null;
	}
}

export function hasSessionCookie(headers: Headers): boolean {
	return SESSION_COOKIE.test(headers.get("cookie") ?? "");
}

/** True when a request should be refused as cross-site. */
export function isCsrfBlocked(
	request: Request,
	trustedOrigins: Set<string>,
): boolean {
	if (SAFE_METHODS.has(request.method.toUpperCase())) return false;
	if (!hasSessionCookie(request.headers)) return false;

	const origin = request.headers.get("origin");
	if (origin !== null) {
		const normalized = originOf(origin);
		return !normalized || !trustedOrigins.has(normalized);
	}

	const referer = originOf(request.headers.get("referer"));
	return !referer || !trustedOrigins.has(referer);
}
