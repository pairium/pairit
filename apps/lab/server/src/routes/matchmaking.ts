/**
 * Matchmaking Routes
 * POST /sessions/:id/matchmake - Join matchmaking pool
 * POST /sessions/:id/matchmake/cancel - Leave matchmaking pool
 */

import { Elysia, t } from "elysia";
import {
	enqueueSession,
	getPoolStatus,
	removeSession,
} from "../lib/matchmaking-pool";
import { loadSession } from "./sessions";

export const matchmakingRoutes = new Elysia({ prefix: "/sessions" })
	.post(
		"/:id/matchmake",
		async ({ params: { id }, body, set }) => {
			// Verify session exists
			const session = await loadSession(id);
			if (!session) {
				set.status = 404;
				return { error: "session_not_found" };
			}

			const { poolId, num_users, timeoutSeconds, timeoutTarget, assignment } =
				body;

			const result = await enqueueSession(id, session.configId, poolId, {
				numUsers: num_users,
				timeoutSeconds,
				timeoutTarget,
				assignment,
			});

			if (result.status === "waiting") {
				set.status = 202;
				return { status: "waiting", position: result.position };
			}

			return {
				status: "matched",
				groupId: result.groupId,
				treatment: result.treatment,
			};
		},
		{
			params: t.Object({ id: t.String() }),
			body: t.Object({
				poolId: t.String(),
				num_users: t.Number({ minimum: 2 }),
				timeoutSeconds: t.Number({ minimum: 1 }),
				timeoutTarget: t.Optional(t.String()),
				assignment: t.Optional(
					t.Union([t.Literal("random"), t.Literal("round-robin")]),
				),
			}),
		},
	)
	.post(
		"/:id/matchmake/cancel",
		async ({ params: { id }, body, set }) => {
			// Verify session exists
			const session = await loadSession(id);
			if (!session) {
				set.status = 404;
				return { error: "session_not_found" };
			}

			const result = removeSession(id, body.poolId);
			return result;
		},
		{
			params: t.Object({ id: t.String() }),
			body: t.Object({
				poolId: t.String(),
			}),
		},
	)
	// Debug endpoint (development only)
	.get(
		"/matchmaking/status",
		async () => {
			return { pools: getPoolStatus() };
		},
		{},
	);
