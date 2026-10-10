/**
 * Auth helper for lab server
 * Only POST /sessions/start checks the Better Auth session.
 *
 * Security Model (Qualtrics-style):
 * - requireAuth: false → Anyone can start sessions, session UUID = authorization
 * - requireAuth: true  → Must have valid Better Auth session to start
 */

import type { User } from "@pairit/auth";
import { auth } from "./auth";

export async function getAuthUser(request: Request): Promise<User | null> {
	const sessionData = await auth.api
		.getSession({ headers: request.headers })
		.catch(() => null);
	return sessionData?.user ?? null;
}
