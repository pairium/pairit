/**
 * Timer Routes
 * POST /sessions/:id/timer - Start or fetch server-backed timer deadline
 */

import { Elysia, t } from "elysia";
import { allowedTargets, findTimer, getConfigPage } from "../lib/config-lookup";
import { denySessionAccess } from "../lib/session-access";
import { startOrGetTimer } from "../lib/timers";
import { loadSession } from "./sessions";

export const timersRoutes = new Elysia({ prefix: "/sessions" }).post(
	"/:id/timer",
	async ({ params: { id }, body, set, request }) => {
		const denied = await denySessionAccess(request, id, set);
		if (denied) return denied;

		const session = await loadSession(id);
		if (!session) {
			set.status = 404;
			return { error: "session_not_found" };
		}
		if (session.endedAt) {
			set.status = 409;
			return { error: "session_ended" };
		}

		const pageId = body.pageId || session.currentPageId;

		// Allow the current page or a direct allowed target (the lab app swaps
		// optimistically before POST /advance completes).
		if (pageId !== session.currentPageId) {
			const currentPage = getConfigPage(session.config, session.currentPageId);
			if (!allowedTargets(currentPage).has(pageId)) {
				set.status = 409;
				return { error: "page_mismatch" };
			}
		}

		const settings = findTimer(session.config, pageId, body.componentId);
		if (!settings) {
			set.status = 400;
			return { error: "unknown_timer" };
		}

		return await startOrGetTimer(session, pageId, settings);
	},
	{
		params: t.Object({ id: t.String() }),
		body: t.Object({
			pageId: t.Optional(t.String()),
			componentId: t.Optional(t.String()),
		}),
	},
);
