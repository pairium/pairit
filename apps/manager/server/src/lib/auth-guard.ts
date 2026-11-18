import type { Session, User } from "@pairit/auth";
import type { Elysia } from "elysia";
import { isCsrfBlocked } from "./csrf";

export type AuthDerived = {
	user: User | null;
	session: Session | null;
	isAdmin: boolean;
	csrfBlocked: boolean;
};

export type AuthGuardDeps = {
	getSession: (
		headers: Headers,
	) => Promise<{ user: User; session: Session } | null>;
	findAllowed: (email: string) => Promise<{ isAdmin: boolean } | null>;
	trustedOrigins: () => Set<string>;
};

/**
 * Derives the caller (session + allowlist entry) and refuses cookie-authenticated
 * state-changing requests from untrusted origins with 403.
 */
export function createAuthMiddleware(deps: AuthGuardDeps) {
	return (app: Elysia) =>
		app
			.derive(async ({ request }): Promise<AuthDerived> => {
				const anonymous = {
					user: null,
					session: null,
					isAdmin: false,
					csrfBlocked: false,
				};
				if (isCsrfBlocked(request, deps.trustedOrigins())) {
					return { ...anonymous, csrfBlocked: true };
				}

				const sessionData = await deps.getSession(request.headers);
				const user = sessionData?.user ?? null;
				if (!user) return anonymous;

				const entry = await deps.findAllowed(user.email);
				if (!entry) return anonymous;

				return {
					user,
					session: sessionData?.session ?? null,
					isAdmin: entry.isAdmin,
					csrfBlocked: false,
				};
			})
			.onBeforeHandle(({ csrfBlocked, set }) => {
				if (csrfBlocked) {
					set.status = 403;
					return {
						error: "forbidden_origin",
						message: "Cross-site request refused",
					};
				}
			});
}
