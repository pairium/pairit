/**
 * Chat routes for lab server
 * POST /chat/:groupId/send - Send a message to a chat group
 * GET /chat/:groupId/history - Get message history for a chat group
 */

import { Elysia, t } from "elysia";
import { MongoServerError, type ObjectId } from "mongodb";
import { triggerAgents, triggerFirstMessageAgents } from "../lib/agent-runner";
import { getChatMessagesCollection } from "../lib/db";
import { getGroupMembers, verifyMembership } from "../lib/groups";
import { broadcastToSession } from "../lib/sse";
import type { ChatMessageDocument } from "../types";

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

			// Trigger AI agents if message is from a participant
			const effectiveSenderType = senderType ?? "participant";
			if (effectiveSenderType !== "agent" && effectiveSenderType !== "system") {
				triggerAgents(groupId, sessionId).catch((err) => {
					console.error("[Chat] Failed to trigger agents:", err);
				});
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
	)
	.post(
		"/:groupId/start-agents",
		async ({ params: { groupId }, body, set }) => {
			const { sessionId } = body;

			// Verify membership
			const isMember = await verifyMembership(sessionId, groupId);
			if (!isMember) {
				set.status = 403;
				return { error: "not_a_member" };
			}

			// Trigger agents with sendFirstMessage: true
			triggerFirstMessageAgents(groupId, sessionId).catch((err) => {
				console.error("[Chat] Failed to trigger first message agents:", err);
			});

			return { ok: true };
		},
		{
			params: t.Object({ groupId: t.String() }),
			body: t.Object({
				sessionId: t.String({ minLength: 1 }),
			}),
		},
	);
