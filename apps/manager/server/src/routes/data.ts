/**
 * Data export routes for manager server
 * GET /data/:configId/sessions - Export sessions for a config
 * GET /data/:configId/events - Export events for a config
 * GET /data/:configId/chat-messages - Export chat messages for a config
 */
import { Elysia, t } from "elysia";
import { authMiddleware } from "../lib/auth-middleware";
import {
	getChatMessagesCollection,
	getConfigsCollection,
	getEventsCollection,
	getSessionsCollection,
} from "../lib/db";

export const dataRoutes = new Elysia({ prefix: "/data" })
	.use(authMiddleware)
	.get(
		"/:configId/sessions",
		async ({ params: { configId }, set, user }) => {
			if (!user) {
				set.status = 401;
				return { error: "unauthorized", message: "Not authenticated" };
			}

			// Verify ownership
			const configsCollection = await getConfigsCollection();
			const config = await configsCollection.findOne({ configId });
			if (!config) {
				set.status = 404;
				return { error: "not_found", message: "Config not found" };
			}
			if (config.owner !== user.id) {
				set.status = 403;
				return {
					error: "forbidden",
					message: "Not authorized to export this config's data",
				};
			}

			const sessionsCollection = await getSessionsCollection();
			const sessions = await sessionsCollection
				.find({ configId })
				.sort({ createdAt: 1 })
				.toArray();

			const exportData = sessions.map((session) => ({
				sessionId: session.id,
				configId: session.configId,
				currentPageId: session.currentPageId,
				status: session.endedAt ? "completed" : "in_progress",
				user_state: session.user_state ?? {},
				prolific: session.prolific ?? null,
				userId: session.userId ?? null,
				createdAt: session.createdAt?.toISOString() ?? null,
				updatedAt: session.updatedAt?.toISOString() ?? null,
				endedAt: session.endedAt ?? null,
			}));

			return { sessions: exportData };
		},
		{
			params: t.Object({
				configId: t.String(),
			}),
		},
	)
	.get(
		"/:configId/events",
		async ({ params: { configId }, set, user }) => {
			if (!user) {
				set.status = 401;
				return { error: "unauthorized", message: "Not authenticated" };
			}

			// Verify ownership
			const configsCollection = await getConfigsCollection();
			const config = await configsCollection.findOne({ configId });
			if (!config) {
				set.status = 404;
				return { error: "not_found", message: "Config not found" };
			}
			if (config.owner !== user.id) {
				set.status = 403;
				return {
					error: "forbidden",
					message: "Not authorized to export this config's data",
				};
			}

			const eventsCollection = await getEventsCollection();
			const events = await eventsCollection
				.find({ configId })
				.sort({ createdAt: 1 })
				.toArray();

			const exportData = events.map((event) => ({
				sessionId: event.sessionId,
				type: event.type,
				pageId: event.pageId,
				componentType: event.componentType,
				componentId: event.componentId,
				data: event.data ?? {},
				timestamp: event.timestamp,
				createdAt: event.createdAt?.toISOString() ?? null,
			}));

			return { events: exportData };
		},
		{
			params: t.Object({
				configId: t.String(),
			}),
		},
	)
	.get(
		"/:configId/chat-messages",
		async ({ params: { configId }, set, user }) => {
			if (!user) {
				set.status = 401;
				return { error: "unauthorized", message: "Not authenticated" };
			}

			// Verify ownership
			const configsCollection = await getConfigsCollection();
			const config = await configsCollection.findOne({ configId });
			if (!config) {
				set.status = 404;
				return { error: "not_found", message: "Config not found" };
			}
			if (config.owner !== user.id) {
				set.status = 403;
				return {
					error: "forbidden",
					message: "Not authorized to export this config's data",
				};
			}

			// Get all sessions for this config to find their chat messages
			const sessionsCollection = await getSessionsCollection();
			const sessions = await sessionsCollection
				.find({ configId })
				.project({ id: 1, "user_state.chat_group_id": 1 })
				.toArray();

			const sessionIds = sessions.map((s) => s.id);
			const groupIds = new Set<string>();

			// Collect all group IDs (session's own ID for human-AI chat, plus chat_group_id for group chats)
			for (const session of sessions) {
				groupIds.add(session.id);
				if (session.user_state?.chat_group_id) {
					groupIds.add(session.user_state.chat_group_id as string);
				}
			}

			const chatCollection = await getChatMessagesCollection();
			const messages = await chatCollection
				.find({
					$or: [
						{ groupId: { $in: Array.from(groupIds) } },
						{ sessionId: { $in: sessionIds } },
					],
				})
				.sort({ createdAt: 1 })
				.toArray();

			const exportData = messages.map((msg) => ({
				messageId: msg._id?.toString() ?? null,
				groupId: msg.groupId,
				sessionId: msg.sessionId,
				senderId: msg.senderId,
				senderType: msg.senderType,
				content: msg.content,
				createdAt: msg.createdAt?.toISOString() ?? null,
			}));

			return { messages: exportData };
		},
		{
			params: t.Object({
				configId: t.String(),
			}),
		},
	);
