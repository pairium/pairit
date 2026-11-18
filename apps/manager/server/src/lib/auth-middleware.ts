/**
 * Auth middleware for manager server.
 *
 * Validates Better Auth session and enforces the allowlist on every request:
 * defense-in-depth in case an existing session outlived an allowlist removal.
 * Cookie-authenticated state-changing requests must also come from a trusted
 * origin (see csrf.ts).
 */

import { getTrustedOrigins } from "@pairit/auth";
import { findAllowed } from "./allowlist";
import { auth } from "./auth";
import { createAuthMiddleware } from "./auth-guard";
import { normalizeOrigins } from "./csrf";

export type { AuthDerived } from "./auth-guard";

let trustedOrigins: Set<string> | undefined;

export const authMiddleware = createAuthMiddleware({
	getSession: (headers) => auth.api.getSession({ headers }),
	findAllowed,
	trustedOrigins: () => {
		trustedOrigins ??= normalizeOrigins(getTrustedOrigins());
		return trustedOrigins;
	},
});
