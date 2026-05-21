/**
 * Admin routes for managing the manager allowlist.
 *
 * GET    /admin/users          - list allowlist entries
 * POST   /admin/users          - add or upsert an entry
 * DELETE /admin/users/:email   - remove an entry and revoke their sessions
 *
 * All routes require an authenticated user with isAdmin: true.
 */

import { Elysia, t } from "elysia";
import {
	addUser,
	listUsers,
	normalizeEmail,
	removeUser,
} from "../lib/allowlist";
import { auth } from "../lib/auth";
import { authMiddleware } from "../lib/auth-middleware";

async function revokeSessionsForEmail(email: string): Promise<void> {
	const ctx = await auth.$context;
	const result = await ctx.internalAdapter.findUserByEmail(email);
	if (!result?.user?.id) return;
	await ctx.internalAdapter.deleteSessions(result.user.id);
}

export const adminRoutes = new Elysia({ prefix: "/admin" })
	.use(authMiddleware)
	.get("/users", async ({ user, isAdmin, set }) => {
		if (!user) {
			set.status = 401;
			return { error: "unauthorized", message: "Not authenticated" };
		}
		if (!isAdmin) {
			set.status = 403;
			return { error: "forbidden", message: "Admin role required" };
		}
		const users = await listUsers();
		return { users };
	})
	.post(
		"/users",
		async ({ user, isAdmin, body, set }) => {
			if (!user) {
				set.status = 401;
				return { error: "unauthorized", message: "Not authenticated" };
			}
			if (!isAdmin) {
				set.status = 403;
				return { error: "forbidden", message: "Admin role required" };
			}
			const entry = await addUser({
				email: body.email,
				isAdmin: body.isAdmin ?? false,
				addedBy: user.email,
			});
			return { user: entry };
		},
		{
			body: t.Object({
				email: t.String({ minLength: 3 }),
				isAdmin: t.Optional(t.Boolean()),
			}),
		},
	)
	.delete("/users/:email", async ({ user, isAdmin, params, set }) => {
		if (!user) {
			set.status = 401;
			return { error: "unauthorized", message: "Not authenticated" };
		}
		if (!isAdmin) {
			set.status = 403;
			return { error: "forbidden", message: "Admin role required" };
		}
		const email = normalizeEmail(decodeURIComponent(params.email));
		if (email === normalizeEmail(user.email)) {
			set.status = 400;
			return {
				error: "self_removal",
				message: "You cannot remove yourself from the allowlist",
			};
		}
		const removed = await removeUser(email);
		if (!removed) {
			set.status = 404;
			return { error: "not_found", message: "No such allowlist entry" };
		}
		await revokeSessionsForEmail(email);
		return { ok: true };
	});
