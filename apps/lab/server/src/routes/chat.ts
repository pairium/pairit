/**
 * Chat routes for lab server
 * POST /chat/:groupId/send - Send a message to a chat group
 * GET /chat/:groupId/history - Get message history for a chat group
 */

import { Elysia, t } from "elysia";
import { MongoServerError, type ObjectId } from "mongodb";
import { triggerAgents, triggerJoinAgents } from "../lib/agent-runner";
import { resolveParticipantAvatar } from "../lib/chat-avatar";
import { takeChatSlot } from "../lib/chat-rate-limit";
import { getChatMessagesCollection, getSessionsCollection } from "../lib/db";
import { sessionStateChanged } from "../lib/group-view";
import { getGroupMembers, verifyMembership } from "../lib/groups";
import { claimIdempotencyKey } from "../lib/idempotency";
import { memberId, publicSenderId } from "../lib/member-id";
import { denySessionAccess } from "../lib/session-access";
import { broadcastToSession } from "../lib/sse";
import type { ChatMessageDocument } from "../types";

const MAX_CONTENT_LENGTH = 4000;

/** Returns an error body if the session is over its chat limit. */
async function checkRateLimit(
	sessionId: string,
): Promise<{ error: string } | null> {
	const collection = await getChatMessagesCollection();
	const sent = await collection.countDocuments({
		senderId: sessionId,
		senderType: "participant",
	});
	const slot = takeChatSlot(sessionId, sent);
	return slot.ok ? null : { error: `rate_limited_${slot.reason}` };
}

export const chatRoutes = new Elysia({ prefix: "/chat" })
	.post(
		"/:groupId/send",
		async ({ params: { groupId }, body, set, request }) => {
			const { sessionId, content, idempotencyKey } = body;
			const denied = await denySessionAccess(request, sessionId, set);
			if (denied) return denied;

			// Verify membership
			const isMember = await verifyMembership(sessionId, groupId);
			if (!isMember) {
				set.status = 403;
				return { error: "not_a_member" };
			}

			const sessionsCollection = await getSessionsCollection();
			const session = await sessionsCollection.findOne(
				{ id: sessionId },
				{
					projection: {
						configId: 1,
						config: 1,
						currentPageId: 1,
						session_state: 1,
					},
				},
			);
			if (!session) {
				set.status = 404;
				return { error: "session_not_found" };
			}

			const collection = await getChatMessagesCollection();

			// Check idempotency if key provided
			if (idempotencyKey) {
				const existing = await collection.findOne({
					idempotencyKey,
					sessionId,
				});
				if (existing) {
					return {
						messageId: existing._id?.toString(),
						senderId: memberId(groupId, sessionId),
						createdAt: existing.createdAt.toISOString(),
						...(existing.avatar && { avatar: existing.avatar }),
						deduplicated: true,
					};
				}
			}

			const limited = await checkRateLimit(sessionId);
			if (limited) {
				set.status = 429;
				return limited;
			}

			// Only the server writes agent and system messages
			const effectiveSenderType = "participant" as const;
			const avatar =
				effectiveSenderType === "participant"
					? resolveParticipantAvatar(
							session.config,
							session.currentPageId,
							session.session_state,
						)
					: undefined;

			const now = new Date();
			const message: ChatMessageDocument = {
				groupId,
				sessionId,
				configId: session.configId,
				senderId: sessionId,
				senderType: effectiveSenderType,
				content,
				createdAt: now,
				...(avatar && { avatar }),
				...(idempotencyKey && { idempotencyKey }),
			};

			let insertedId: ObjectId;
			try {
				const result = await collection.insertOne(message);
				insertedId = result.insertedId;
			} catch (err) {
				// Handle duplicate key error for idempotency
				if (err instanceof MongoServerError && err.code === 11000) {
					const existing = await collection.findOne({
						idempotencyKey,
						sessionId,
					});
					if (existing) {
						return {
							messageId: existing._id?.toString(),
							senderId: memberId(groupId, sessionId),
							createdAt: existing.createdAt.toISOString(),
							...(existing.avatar && { avatar: existing.avatar }),
							deduplicated: true,
						};
					}
				}
				throw err;
			}

			const messageId = insertedId.toString();

			let messagesSent: number | undefined;
			{
				const updatedSession = await sessionsCollection.findOneAndUpdate(
					{ id: sessionId },
					{
						$inc: { "session_state.chat.messages_sent": 1 },
						$set: { updatedAt: new Date() },
					},
					{
						returnDocument: "after",
						projection: { "session_state.chat.messages_sent": 1 },
					},
				);
				messagesSent =
					typeof updatedSession?.session_state?.chat === "object" &&
					updatedSession.session_state.chat &&
					typeof (updatedSession.session_state.chat as Record<string, unknown>)
						.messages_sent === "number"
						? ((updatedSession.session_state.chat as Record<string, unknown>)
								.messages_sent as number)
						: undefined;
				if (messagesSent !== undefined) {
					broadcastToSession(sessionId, "state_updated", {
						path: "chat.messages_sent",
						value: messagesSent,
					});
					sessionStateChanged(sessionId, ["chat"]).catch((error) => {
						console.error("[Group] Failed to share state:", error);
					});
				}
			}

			// Broadcast to all group members
			const memberIds = await getGroupMembers(groupId);
			// Peers see a per-group member ID, never the sender's sessionId.
			const eventData = {
				messageId,
				groupId,
				senderId: publicSenderId(groupId, sessionId),
				senderType: effectiveSenderType,
				content,
				createdAt: now.toISOString(),
				...(avatar && { avatar }),
			};

			for (const memberId of memberIds) {
				broadcastToSession(memberId, "chat_message", eventData);
			}

			// Trigger AI agents
			triggerAgents(groupId, sessionId).catch((err) => {
				console.error("[Chat] Failed to trigger agents:", err);
			});

			return {
				messageId,
				senderId: memberId(groupId, sessionId),
				createdAt: now.toISOString(),
				...(avatar && { avatar }),
				...(messagesSent !== undefined ? { messagesSent } : {}),
			};
		},
		{
			params: t.Object({ groupId: t.String() }),
			body: t.Object({
				sessionId: t.String({ minLength: 1 }),
				content: t.String({ minLength: 1, maxLength: MAX_CONTENT_LENGTH }),
				idempotencyKey: t.Optional(t.String()),
			}),
		},
	)
	.get(
		"/:groupId/history",
		async ({ params: { groupId }, query, set, request }) => {
			const { sessionId } = query;
			const denied = await denySessionAccess(request, sessionId, set);
			if (denied) return denied;

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
				// The caller's own member ID, so the client can tell its messages apart.
				self: memberId(groupId, sessionId),
				messages: messages.map((msg) => ({
					messageId: msg._id?.toString(),
					groupId: msg.groupId,
					senderId: publicSenderId(groupId, msg.senderId),
					senderType: msg.senderType,
					content: msg.content,
					createdAt: msg.createdAt.toISOString(),
					avatar: msg.avatar,
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
		async ({ params: { groupId }, body, set, request }) => {
			const { sessionId, idempotencyKey } = body;
			const denied = await denySessionAccess(request, sessionId, set);
			if (denied) return denied;

			// Verify membership
			const isMember = await verifyMembership(sessionId, groupId);
			if (!isMember) {
				set.status = 403;
				return { error: "not_a_member" };
			}

			if (idempotencyKey) {
				const { duplicate } = await claimIdempotencyKey(
					sessionId,
					idempotencyKey,
				);
				if (duplicate) {
					return { ok: true, deduplicated: true };
				}
			}

			const limited = await checkRateLimit(sessionId);
			if (limited) {
				set.status = 429;
				return limited;
			}

			// Trigger join agents (on_join trigger + legacy sendFirstMessage)
			triggerJoinAgents(groupId, sessionId).catch((err) => {
				console.error("[Chat] Failed to trigger join agents:", err);
			});

			return { ok: true };
		},
		{
			params: t.Object({ groupId: t.String() }),
			body: t.Object({
				sessionId: t.String({ minLength: 1 }),
				idempotencyKey: t.Optional(t.String({ minLength: 1 })),
			}),
		},
	);
