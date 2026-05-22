/**
 * Better Auth database hooks that gate manager sign-ins on the allowlist.
 *
 * - user.create.before: reject sign-ups whose email isn't allowlisted, so we
 *   never leave orphan user rows behind.
 * - session.create.before: reject existing-user sign-ins removed from the
 *   allowlist after their initial sign-up.
 */

import type { BetterAuthOptions } from "better-auth";
import { APIError, getOAuthState } from "better-auth/api";
import { findAllowed } from "./allowlist";

export function getContactEmail(): string {
	return process.env.MANAGER_ADMIN_CONTACT_EMAIL || "pairit@pairium.ai";
}

function deniedMessage(): string {
	return `Not authorized — email ${getContactEmail()} to request access.`;
}

type HookContext = {
	path?: string;
	context: {
		baseURL: string;
		options: { onAPIError?: { errorURL?: string } };
		internalAdapter: {
			findUserById: (id: string) => Promise<{ email?: string } | null>;
		};
	};
	redirect: (url: string) => unknown;
};

function isOAuthCallback(ctx: HookContext | undefined): boolean {
	const path = ctx?.path ?? "";
	return path.startsWith("/callback") || path.startsWith("/oauth2/callback");
}

async function accessDeniedURL(ctx: HookContext): Promise<string> {
	const state = await getOAuthState();
	if (state?.errorURL) return state.errorURL;
	return (
		ctx.context.options.onAPIError?.errorURL ??
		`${ctx.context.baseURL.replace(/\/api\/auth\/?$/, "")}/access-denied`
	);
}

export const allowlistHooks: BetterAuthOptions["databaseHooks"] = {
	user: {
		create: {
			async before(user) {
				const email = typeof user.email === "string" ? user.email : null;
				if (!email || !(await findAllowed(email))) {
					throw new APIError("FORBIDDEN", {
						message: deniedMessage(),
						code: "ALLOWLIST_DENIED",
					});
				}
			},
		},
	},
	session: {
		create: {
			async before(session, ctx) {
				const hookCtx = ctx as HookContext | undefined;
				if (!hookCtx) return;
				const user = await hookCtx.context.internalAdapter.findUserById(
					session.userId,
				);
				if (user?.email && (await findAllowed(user.email))) return;

				if (isOAuthCallback(hookCtx)) {
					throw hookCtx.redirect(await accessDeniedURL(hookCtx));
				}
				throw new APIError("FORBIDDEN", {
					message: deniedMessage(),
					code: "ALLOWLIST_DENIED",
				});
			},
		},
	},
};
