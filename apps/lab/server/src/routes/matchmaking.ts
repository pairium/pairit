/**
 * Matchmaking Routes
 * POST /sessions/:id/matchmake - Join matchmaking pool
 * POST /sessions/:id/matchmake/cancel - Leave matchmaking pool
 */

import { Elysia, t } from "elysia";
import { DEFAULT_POOL_ID, findMatchmaking } from "../lib/config-lookup";
import { getGroupsCollection } from "../lib/db";
import {
	enqueueSession,
	getPoolStatus,
	removeSession,
} from "../lib/matchmaking-pool";
import { denySessionAccess } from "../lib/session-access";
import { loadSession } from "./sessions";

export const matchmakingRoutes = new Elysia({ prefix: "/sessions" })
	.post(
		"/:id/matchmake",
		async ({ params: { id }, body, set, request }) => {
			const denied = await denySessionAccess(request, id, set);
			if (denied) return denied;
			// Verify session exists
			const session = await loadSession(id);
			if (!session) {
				set.status = 404;
				return { error: "session_not_found" };
			}

			// Pool settings come from the config, never from the client
			const poolId = body.poolId || DEFAULT_POOL_ID;
			const settings = findMatchmaking(session.config, poolId);
			if (!settings) {
				set.status = 400;
				return { error: "unknown_pool" };
			}

			// Already grouped in this pool (e.g. a rejoin after a dropped stream
			// missed match_found) — report the match instead of re-queueing
			const groupsCollection = await getGroupsCollection();
			const existingGroup = await groupsCollection.findOne({
				configId: session.configId,
				poolId,
				memberSessionIds: id,
			});
			if (existingGroup) {
				return {
					status: "matched",
					groupId: existingGroup.groupId,
					treatment: existingGroup.treatment,
				};
			}

			const result = await enqueueSession(
				id,
				session.configId,
				poolId,
				{
					numUsers: settings.numUsers,
					timeoutSeconds: settings.timeoutSeconds,
					timeoutTarget: settings.timeoutTarget,
					assignmentType: settings.assignmentType,
					conditions: settings.conditions,
				},
				session.simulated === true,
			);

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
			// Old clients also send the pool settings; they are ignored
			body: t.Object({
				poolId: t.String(),
				num_users: t.Optional(t.Unknown()),
				timeoutSeconds: t.Optional(t.Unknown()),
				timeoutTarget: t.Optional(t.Unknown()),
				assignmentType: t.Optional(t.Unknown()),
				conditions: t.Optional(t.Unknown()),
			}),
		},
	)
	.post(
		"/:id/matchmake/cancel",
		async ({ params: { id }, body, set, request }) => {
			const denied = await denySessionAccess(request, id, set);
			if (denied) return denied;
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
		async ({ set }) => {
			if (process.env.NODE_ENV !== "development") {
				set.status = 404;
				return { error: "not_found" };
			}
			return { pools: getPoolStatus() };
		},
		{},
	);
