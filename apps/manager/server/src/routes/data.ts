/**
 * Data export routes for manager server
 * GET /data/:configId/sessions - Export sessions for a config
 * GET /data/:configId/events - Export events for a config
 * GET /data/:configId/chat-messages - Export chat messages for a config
 */
import { Elysia, t } from "elysia";
import { authMiddleware } from "../lib/auth-middleware";
import {
	type Cursor,
	CursorError,
	cursorFilter,
	encodeCursor,
	parseCursor,
	parseLimit,
} from "../lib/cursor";
import {
	getChatMessagesCollection,
	getConfigsCollection,
	getEventsCollection,
	getGroupsCollection,
	getSessionsCollection,
	getWorkspaceDocumentsCollection,
} from "../lib/db";

const paginationQuerySchema = t.Object({
	since: t.Optional(t.String()),
	limit: t.Optional(t.String()),
});

type PaginationQuery = { since?: string; limit?: string };

function parsePagination(
	query: PaginationQuery,
): { cursor: Cursor | null; limit: number } | CursorError {
	try {
		return {
			cursor: parseCursor(query.since),
			limit: parseLimit(query.limit),
		};
	} catch (err) {
		if (err instanceof CursorError) return err;
		throw err;
	}
}

export const dataRoutes = new Elysia({ prefix: "/data" })
	.use(authMiddleware)
	.get(
		"/:configId/sessions",
		async ({ params: { configId }, query, set, user }) => {
			if (!user) {
				set.status = 401;
				return { error: "unauthorized", message: "Not authenticated" };
			}

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

			const pag = parsePagination(query);
			if (pag instanceof CursorError) {
				set.status = 400;
				return { error: "bad_request", message: pag.message };
			}
			const { cursor, limit } = pag;

			const sessionsCollection = await getSessionsCollection();
			const filter = cursor
				? { configId, ...cursorFilter("createdAt", cursor) }
				: { configId };
			const sessions = await sessionsCollection
				.find(filter)
				.sort({ createdAt: 1, _id: 1 })
				.limit(limit)
				.toArray();

			const exportData = sessions.map((session) => ({
				sessionId: session.id,
				configId: session.configId,
				currentPageId: session.currentPageId,
				status: session.endedAt ? "completed" : "in_progress",
				session_state: session.session_state ?? {},
				prolific: session.prolific ?? null,
				userId: session.userId ?? null,
				createdAt: session.createdAt?.toISOString() ?? null,
				updatedAt: session.updatedAt?.toISOString() ?? null,
				endedAt: session.endedAt ?? null,
			}));

			const last = sessions.at(-1);
			const nextCursor =
				sessions.length === limit && last?.createdAt && last._id
					? encodeCursor(last.createdAt, last._id)
					: null;

			return { sessions: exportData, nextCursor };
		},
		{
			params: t.Object({ configId: t.String() }),
			query: paginationQuerySchema,
		},
	)
	.get(
		"/:configId/events",
		async ({ params: { configId }, query, set, user }) => {
			if (!user) {
				set.status = 401;
				return { error: "unauthorized", message: "Not authenticated" };
			}

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

			const pag = parsePagination(query);
			if (pag instanceof CursorError) {
				set.status = 400;
				return { error: "bad_request", message: pag.message };
			}
			const { cursor, limit } = pag;

			const eventsCollection = await getEventsCollection();
			const filter = cursor
				? { configId, ...cursorFilter("createdAt", cursor) }
				: { configId };
			const events = await eventsCollection
				.find(filter)
				.sort({ createdAt: 1, _id: 1 })
				.limit(limit)
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

			const last = events.at(-1);
			const nextCursor =
				events.length === limit && last?.createdAt && last._id
					? encodeCursor(last.createdAt, last._id)
					: null;

			return { events: exportData, nextCursor };
		},
		{
			params: t.Object({ configId: t.String() }),
			query: paginationQuerySchema,
		},
	)
	.get(
		"/:configId/chat-messages",
		async ({ params: { configId }, query, set, user }) => {
			if (!user) {
				set.status = 401;
				return { error: "unauthorized", message: "Not authenticated" };
			}

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

			const pag = parsePagination(query);
			if (pag instanceof CursorError) {
				set.status = 400;
				return { error: "bad_request", message: pag.message };
			}
			const { cursor, limit } = pag;

			const chatCollection = await getChatMessagesCollection();
			const filter = cursor
				? { configId, ...cursorFilter("createdAt", cursor) }
				: { configId };
			const messages = await chatCollection
				.find(filter)
				.sort({ createdAt: 1, _id: 1 })
				.limit(limit)
				.toArray();

			const exportData = messages.map((msg) => ({
				messageId: msg._id?.toString() ?? null,
				groupId: msg.groupId,
				senderId: msg.senderId,
				senderType: msg.senderType,
				content: msg.content,
				createdAt: msg.createdAt?.toISOString() ?? null,
			}));

			const last = messages.at(-1);
			const nextCursor =
				messages.length === limit && last?.createdAt && last._id
					? encodeCursor(last.createdAt, last._id)
					: null;

			return { messages: exportData, nextCursor };
		},
		{
			params: t.Object({ configId: t.String() }),
			query: paginationQuerySchema,
		},
	)
	.get(
		"/:configId/groups",
		async ({ params: { configId }, query, set, user }) => {
			if (!user) {
				set.status = 401;
				return { error: "unauthorized", message: "Not authenticated" };
			}

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

			const pag = parsePagination(query);
			if (pag instanceof CursorError) {
				set.status = 400;
				return { error: "bad_request", message: pag.message };
			}
			const { cursor, limit } = pag;

			const groupsCollection = await getGroupsCollection();
			const filter = cursor
				? { configId, ...cursorFilter("matchedAt", cursor) }
				: { configId };
			const groups = await groupsCollection
				.find(filter)
				.sort({ matchedAt: 1, _id: 1 })
				.limit(limit)
				.toArray();

			// Explode memberSessionIds → one row per (group, session)
			const exportData = groups.flatMap((group) =>
				group.memberSessionIds.map((sessionId) => ({
					groupId: group.groupId,
					sessionId,
					poolId: group.poolId,
					treatment: group.treatment,
					matchedAt: group.matchedAt?.toISOString() ?? null,
					status: group.status,
				})),
			);

			const last = groups.at(-1);
			const nextCursor =
				groups.length === limit && last?.matchedAt && last._id
					? encodeCursor(last.matchedAt, last._id)
					: null;

			return { groups: exportData, nextCursor };
		},
		{
			params: t.Object({ configId: t.String() }),
			query: paginationQuerySchema,
		},
	)
	.get(
		"/:configId/survey-responses",
		async ({ params: { configId }, query, set, user }) => {
			if (!user) {
				set.status = 401;
				return { error: "unauthorized", message: "Not authenticated" };
			}

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

			const pag = parsePagination(query);
			if (pag instanceof CursorError) {
				set.status = 400;
				return { error: "bad_request", message: pag.message };
			}
			const { cursor, limit } = pag;

			const baseOr = [
				{ componentType: "survey" },
				{ componentType: "paged_survey", "data.status": "completed" },
			];
			const filter = cursor
				? {
						configId,
						$and: [{ $or: baseOr }, cursorFilter("createdAt", cursor)],
					}
				: { configId, $or: baseOr };

			const eventsCollection = await getEventsCollection();
			const events = await eventsCollection
				.find(filter)
				.sort({ createdAt: 1, _id: 1 })
				.limit(limit)
				.toArray();

			const exportData = events.map((event) => ({
				sessionId: event.sessionId,
				pageId: event.pageId,
				componentId: event.componentId,
				timestamp: event.timestamp,
				data: event.data ?? {},
			}));

			const last = events.at(-1);
			const nextCursor =
				events.length === limit && last?.createdAt && last._id
					? encodeCursor(last.createdAt, last._id)
					: null;

			return { surveyResponses: exportData, nextCursor };
		},
		{
			params: t.Object({ configId: t.String() }),
			query: paginationQuerySchema,
		},
	)
	.get(
		"/:configId/workspace-documents",
		async ({ params: { configId }, query, set, user }) => {
			if (!user) {
				set.status = 401;
				return { error: "unauthorized", message: "Not authenticated" };
			}

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

			const pag = parsePagination(query);
			if (pag instanceof CursorError) {
				set.status = 400;
				return { error: "bad_request", message: pag.message };
			}
			const { cursor, limit } = pag;

			const wsCollection = await getWorkspaceDocumentsCollection();
			const filter = cursor
				? { configId, ...cursorFilter("updatedAt", cursor) }
				: { configId };
			const documents = await wsCollection
				.find(filter)
				.sort({ updatedAt: 1, _id: 1 })
				.limit(limit)
				.toArray();

			const exportData = documents.map((doc) => ({
				groupId: doc.groupId,
				mode: doc.mode,
				content: doc.content ?? null,
				fields: doc.fields ?? null,
				updatedBy: doc.updatedBy,
				createdAt: doc.createdAt?.toISOString() ?? null,
				updatedAt: doc.updatedAt?.toISOString() ?? null,
			}));

			const last = documents.at(-1);
			const nextCursor =
				documents.length === limit && last?.updatedAt && last._id
					? encodeCursor(last.updatedAt, last._id)
					: null;

			return { workspaceDocuments: exportData, nextCursor };
		},
		{
			params: t.Object({ configId: t.String() }),
			query: paginationQuerySchema,
		},
	);
