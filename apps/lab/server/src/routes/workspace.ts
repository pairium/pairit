/**
 * Workspace routes for lab server
 * GET /workspace/:groupId - Fetch workspace document
 * POST /workspace/:groupId/update - Upsert workspace content/fields
 */

import { Elysia, t } from "elysia";
import {
	getEventsCollection,
	getSessionsCollection,
	getWorkspaceDocumentsCollection,
} from "../lib/db";
import { broadcastToSession } from "../lib/sse";

/**
 * Verify that a session is a member of a workspace group.
 * Same logic as chat membership:
 * - Session-scoped: groupId starts with "sessionId:"
 * - Matchmaking: session.user_state.chat_group_id === groupId
 */
async function verifyMembership(
	sessionId: string,
	groupId: string,
): Promise<boolean> {
	if (groupId.startsWith(`${sessionId}:`)) {
		return true;
	}

	const sessionsCollection = await getSessionsCollection();
	const session = await sessionsCollection.findOne({ id: sessionId });
	if (!session) {
		return false;
	}

	return session.user_state?.chat_group_id === groupId;
}

/**
 * Get all session IDs that are members of a workspace group
 */
async function getGroupMembers(groupId: string): Promise<string[]> {
	const colonIndex = groupId.indexOf(":");
	if (colonIndex > 0) {
		const sessionId = groupId.substring(0, colonIndex);
		return [sessionId];
	}

	const sessionsCollection = await getSessionsCollection();
	const sessions = await sessionsCollection
		.find({ "user_state.chat_group_id": groupId })
		.project({ id: 1 })
		.toArray();

	return sessions.map((s) => s.id);
}

export const workspaceRoutes = new Elysia({ prefix: "/workspace" })
	.get(
		"/:groupId",
		async ({ params: { groupId }, query, set }) => {
			const { sessionId } = query;

			const isMember = await verifyMembership(sessionId, groupId);
			if (!isMember) {
				set.status = 403;
				return { error: "not_a_member" };
			}

			const collection = await getWorkspaceDocumentsCollection();
			const doc = await collection.findOne({ groupId });

			if (!doc) {
				return { document: null };
			}

			return {
				document: {
					groupId: doc.groupId,
					mode: doc.mode,
					content: doc.content,
					fields: doc.fields,
					updatedBy: doc.updatedBy,
					updatedAt: doc.updatedAt.toISOString(),
				},
			};
		},
		{
			params: t.Object({ groupId: t.String() }),
			query: t.Object({
				sessionId: t.String({ minLength: 1 }),
			}),
		},
	)
	.post(
		"/:groupId/update",
		async ({ params: { groupId }, body, set }) => {
			const { sessionId, content, fields, mode, configId } = body;

			const isMember = await verifyMembership(sessionId, groupId);
			if (!isMember) {
				set.status = 403;
				return { error: "not_a_member" };
			}

			const collection = await getWorkspaceDocumentsCollection();
			const now = new Date();

			const updateFields: Record<string, unknown> = {
				updatedBy: sessionId,
				updatedAt: now,
			};

			if (content !== undefined) {
				updateFields.content = content;
			}
			if (fields !== undefined) {
				updateFields.fields = fields;
			}

			await collection.updateOne(
				{ groupId },
				{
					$set: updateFields,
					$setOnInsert: {
						groupId,
						mode: mode ?? "freeform",
						configId: configId ?? "",
						createdAt: now,
					},
				},
				{ upsert: true },
			);

			// Broadcast to all group members
			const memberIds = await getGroupMembers(groupId);
			const eventData = {
				groupId,
				content,
				fields,
				updatedBy: sessionId,
				updatedAt: now.toISOString(),
			};

			for (const memberId of memberIds) {
				broadcastToSession(memberId, "workspace_updated", eventData);
			}

			// Log workspace_edit event
			try {
				const eventsCollection = await getEventsCollection();
				await eventsCollection.insertOne({
					type: "workspace_edit",
					timestamp: now.toISOString(),
					sessionId,
					configId: configId ?? "",
					pageId: "",
					componentType: "live-workspace",
					componentId: "",
					data: { groupId, content, fields },
					idempotencyKey: `ws-${Date.now()}-${Math.random().toString(36).slice(2)}`,
					createdAt: now,
				});
			} catch (error) {
				console.error("[Workspace] Failed to log edit event:", error);
			}

			return { ok: true, updatedAt: now.toISOString() };
		},
		{
			params: t.Object({ groupId: t.String() }),
			body: t.Object({
				sessionId: t.String({ minLength: 1 }),
				content: t.Optional(t.String()),
				fields: t.Optional(t.Record(t.String(), t.Unknown())),
				mode: t.Optional(
					t.Union([t.Literal("freeform"), t.Literal("structured")]),
				),
				configId: t.Optional(t.String()),
			}),
		},
	);
