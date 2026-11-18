/**
 * Participant session access.
 *
 * Each session gets a random secret at /sessions/start. The browser keeps it in
 * an HttpOnly cookie named for the session (`pairit_s_<sessionId>`), so several
 * participants can share one browser. The server stores only its sha256.
 *
 * A request may act on a session if it carries that cookie, or if it is signed
 * in (Better Auth) as the session's user. Knowing a sessionId alone is not
 * enough.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { User } from "@pairit/auth";
import { getSessionsCollection } from "./db";

// Loaded lazily: creating Better Auth needs AUTH_SECRET, which unit tests lack.
async function getAuthUser(request: Request) {
	const { getAuthUser } = await import("./auth-middleware");
	return getAuthUser(request);
}

export const SESSION_COOKIE_PREFIX = "pairit_s_";
export const SESSION_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;
/** Most session cookies one browser keeps; older ones are expired at start. */
export const MAX_SESSION_COOKIES = 20;

export function sessionCookieName(sessionId: string): string {
	return `${SESSION_COOKIE_PREFIX}${sessionId}`;
}

export function hashSessionSecret(secret: string): string {
	return createHash("sha256").update(secret).digest("hex");
}

export function mintSessionSecret(): { secret: string; hash: string } {
	const secret = randomBytes(32).toString("base64url");
	return { secret, hash: hashSessionSecret(secret) };
}

export function sessionCookieOptions() {
	return {
		httpOnly: true,
		sameSite: "lax" as const,
		path: "/",
		maxAge: SESSION_COOKIE_MAX_AGE,
		secure: process.env.NODE_ENV !== "development",
	};
}

export function parseCookies(header: string | null): Map<string, string> {
	const cookies = new Map<string, string>();
	if (!header) return cookies;
	for (const part of header.split(";")) {
		const eq = part.indexOf("=");
		if (eq < 0) continue;
		const name = part.slice(0, eq).trim();
		const value = part.slice(eq + 1).trim();
		if (!name) continue;
		try {
			cookies.set(name, decodeURIComponent(value));
		} catch {
			cookies.set(name, value);
		}
	}
	return cookies;
}

/** Session ids of every `pairit_s_*` cookie on the request. */
export function sessionIdsFromCookies(request: Request): string[] {
	const ids: string[] = [];
	for (const name of parseCookies(request.headers.get("cookie")).keys()) {
		if (name.startsWith(SESSION_COOKIE_PREFIX)) {
			ids.push(name.slice(SESSION_COOKIE_PREFIX.length));
		}
	}
	return ids;
}

export function readSessionSecret(
	request: Request,
	sessionId: string,
): string | undefined {
	return parseCookies(request.headers.get("cookie")).get(
		sessionCookieName(sessionId),
	);
}

export function secretMatches(
	secret: string | undefined,
	hash: string | null | undefined,
): boolean {
	if (!secret || !hash) return false;
	const given = Buffer.from(hashSessionSecret(secret), "hex");
	const stored = Buffer.from(hash, "hex");
	return given.length === stored.length && timingSafeEqual(given, stored);
}

export type AccessSession = {
	id: string;
	userId?: string | null;
	secretHash?: string | null;
};

export type AccessResult =
	| { ok: true; legacy: boolean }
	| { ok: false; status: 403 | 404; error: string };

/**
 * Whether `request` may act on `session`. Sessions created before secrets
 * existed have no secretHash and stay open, so participants mid-study during
 * the deploy aren't locked out.
 */
export async function checkSessionAccess(
	request: Request,
	session: AccessSession | null,
	getUser: (request: Request) => Promise<Pick<User, "id"> | null> = getAuthUser,
): Promise<AccessResult> {
	if (!session) return { ok: false, status: 404, error: "session_not_found" };
	if (!session.secretHash) return { ok: true, legacy: true };
	if (
		secretMatches(readSessionSecret(request, session.id), session.secretHash)
	) {
		return { ok: true, legacy: false };
	}
	if (session.userId) {
		const user = await getUser(request);
		if (user?.id === session.userId) return { ok: true, legacy: false };
	}
	return { ok: false, status: 403, error: "session_forbidden" };
}

export type ResumeDecision = "resume" | "resume_and_mint" | "other_browser";

/**
 * Whether a /start that matched an in-progress session may resume it. A
 * Prolific PID can't be verified, so a PID match also needs the session's
 * cookie. A verified sign-in as the session's user resumes on any device.
 */
export function decideResume(
	request: Request,
	session: AccessSession,
	signedInUserId: string | null,
): ResumeDecision {
	if (!session.secretHash) return "resume_and_mint";
	if (
		secretMatches(readSessionSecret(request, session.id), session.secretHash)
	) {
		return "resume";
	}
	if (session.userId && signedInUserId === session.userId) return "resume";
	return "other_browser";
}

/** True when the request carries the configured simulation key. */
export function hasSimulationKey(request: Request): boolean {
	const expected = process.env.SIMULATION_KEY;
	const given = request.headers.get("x-pairit-simulation-key");
	if (!expected || !given) return false;
	return secretMatches(given, hashSessionSecret(expected));
}

async function findAccessSession(
	sessionId: string,
): Promise<AccessSession | null> {
	const sessions = await getSessionsCollection();
	return sessions.findOne(
		{ id: sessionId },
		{ projection: { _id: 0, id: 1, userId: 1, secretHash: 1 } },
	);
}

/**
 * Route guard: returns an error body (and sets the status) when the request
 * may not act on `sessionId`, or null when it may.
 */
export async function denySessionAccess(
	request: Request,
	sessionId: string,
	set: { status?: number | string },
): Promise<{ error: string } | null> {
	const result = await checkSessionAccess(
		request,
		await findAccessSession(sessionId),
	);
	if (result.ok) return null;
	set.status = result.status;
	return { error: result.error };
}
