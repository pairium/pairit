/**
 * Chat routes for lab server
 * POST /chat/:groupId/send - Send a message to a chat group
 * GET /chat/:groupId/history - Get message history for a chat group
 */

import { Elysia, t } from "elysia";
import { MongoServerError, type ObjectId } from "mongodb";
import { getChatMessagesCollection, getSessionsCollection } from "../lib/db";
import { broadcastToSession } from "../lib/sse";
import type { ChatMessageDocument } from "../types";

/**
 * Verify that a session is a member of a chat group.
 * - Human-AI chat: groupId === sessionId
 * - Group chat: session.user_state.chat_group_id === groupId
 */
async function verifyMembership(
	sessionId: string,
	groupId: string,
): Promise<boolean> {
	// Human-AI chat: groupId equals sessionId
	if (sessionId === groupId) {
		return true;
	}

	// Group chat: check user_state.chat_group_id
	const sessionsCollection = await getSessionsCollection();
	const session = await sessionsCollection.findOne({ id: sessionId });
	if (!session) {
		return false;
	}

	return session.user_state?.chat_group_id === groupId;
}

/**
 * Get all session IDs that are members of a chat group
 */
async function getGroupMembers(groupId: string): Promise<string[]> {
	const sessionsCollection = await getSessionsCollection();

	// Find sessions where user_state.chat_group_id matches
	const sessions = await sessionsCollection
		.find({ "user_state.chat_group_id": groupId })
		.project({ id: 1 })
		.toArray();

	const memberIds = sessions.map((s) => s.id);

	// Also include the groupId itself (for human-AI chat where groupId === sessionId)
	if (!memberIds.includes(groupId)) {
		memberIds.push(groupId);
	}

	return memberIds;
}

export const chatRoutes = new Elysia({ prefix: "/chat" })
	.post(
		"/:groupId/send",
		async ({ params: { groupId }, body, set }) => {
			const { sessionId, content, idempotencyKey, senderType } = body;

			// Verify membership
			const isMember = await verifyMembership(sessionId, groupId);
			if (!isMember) {
				set.status = 403;
				return { error: "not_a_member" };
			}

			const collection = await getChatMessagesCollection();

			// Check idempotency if key provided
			if (idempotencyKey) {
				const existing = await collection.findOne({ idempotencyKey });
				if (existing) {
					return {
						messageId: existing._id?.toString(),
						createdAt: existing.createdAt.toISOString(),
						deduplicated: true,
					};
				}
			}

			const now = new Date();
			const message: ChatMessageDocument = {
				groupId,
				sessionId,
				senderId: sessionId,
				senderType: senderType ?? "participant",
				content,
				createdAt: now,
				...(idempotencyKey && { idempotencyKey }),
			};

			let insertedId: ObjectId;
			try {
				const result = await collection.insertOne(message);
				insertedId = result.insertedId;
			} catch (err) {
				// Handle duplicate key error for idempotency
				if (err instanceof MongoServerError && err.code === 11000) {
					const existing = await collection.findOne({ idempotencyKey });
					if (existing) {
						return {
							messageId: existing._id?.toString(),
							createdAt: existing.createdAt.toISOString(),
							deduplicated: true,
						};
					}
				}
				throw err;
			}

			const messageId = insertedId.toString();

			// Broadcast to all group members
			const memberIds = await getGroupMembers(groupId);
			const eventData = {
				messageId,
				groupId,
				sessionId,
				senderId: sessionId,
				senderType: senderType ?? "participant",
				content,
				createdAt: now.toISOString(),
			};

			for (const memberId of memberIds) {
				broadcastToSession(memberId, "chat_message", eventData);
			}

			return {
				messageId,
				createdAt: now.toISOString(),
			};
		},
		{
			params: t.Object({ groupId: t.String() }),
			body: t.Object({
				sessionId: t.String({ minLength: 1 }),
				content: t.String({ minLength: 1 }),
				idempotencyKey: t.Optional(t.String()),
				senderType: t.Optional(
					t.Union([
						t.Literal("participant"),
						t.Literal("agent"),
						t.Literal("system"),
					]),
				),
			}),
		},
	)
	.get(
		"/:groupId/history",
		async ({ params: { groupId }, query, set }) => {
			const { sessionId } = query;

			// Verify membership
			const isMember = await verifyMembership(sessionId, groupId);
			if (!isMember) {
				set.status = 403;
				return { error: "not_a_member" };
			}

			const collection = await getChatMessagesCollection();

			const messages = await collection
				.find({ groupId })
				.sort({ createdAt: 1 })
				.toArray();

			return {
				messages: messages.map((msg) => ({
					messageId: msg._id?.toString(),
					groupId: msg.groupId,
					sessionId: msg.sessionId,
					senderId: msg.senderId,
					senderType: msg.senderType,
					content: msg.content,
					createdAt: msg.createdAt.toISOString(),
				})),
			};
		},
		{
			params: t.Object({ groupId: t.String() }),
			query: t.Object({
				sessionId: t.String({ minLength: 1 }),
			}),
		},
	);
