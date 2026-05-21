/**
 * Auth middleware for manager server.
 *
 * Validates Better Auth session and enforces the allowlist on every request:
 * defense-in-depth in case an existing session outlived an allowlist removal.
 */

import type { Session, User } from "@pairit/auth";
import type { Elysia } from "elysia";
import { findAllowed } from "./allowlist";
import { auth } from "./auth";

export type AuthDerived = {
	user: User | null;
	session: Session | null;
	isAdmin: boolean;
};

export const authMiddleware = (app: Elysia) =>
	app.derive(async ({ request }): Promise<AuthDerived> => {
		const sessionData = await auth.api.getSession({
			headers: request.headers,
		});

		const user = sessionData?.user ?? null;
		if (!user) {
			return { user: null, session: null, isAdmin: false };
		}

		const entry = await findAllowed(user.email);
		if (!entry) {
			return { user: null, session: null, isAdmin: false };
		}

		return {
			user,
			session: sessionData?.session ?? null,
			isAdmin: entry.isAdmin,
		};
	});
