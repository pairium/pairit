/**
 * Chat Runtime - Connects ChatView to the runtime system
 * Handles SSE subscription, message history, and event emission
 */

import {
	type ChatMessage as ApiChatMessage,
	getChatHistory,
	sendChatMessage,
	submitEvent,
} from "@app/lib/api";
import { sseClient } from "@app/lib/sse";
import { defineRuntimeComponent } from "@app/runtime/define-runtime-component";
import { useCallback, useEffect, useRef, useState } from "react";
import { type ChatMessage, ChatView } from "./ChatView";

type ChatProps = {
	placeholder?: string;
};

type SSEChatMessage = {
	messageId: string;
	groupId: string;
	sessionId: string;
	senderId: string;
	senderType: "participant" | "agent" | "system";
	content: string;
	createdAt: string;
};

type SSEChatEnded = {
	groupId: string;
};

export const ChatRuntime = defineRuntimeComponent<"chat", ChatProps>({
	type: "chat",
	renderer: ({ component, context }) => {
		const { sessionId, userState } = context;
		const [messages, setMessages] = useState<ChatMessage[]>([]);
		const [loading, setLoading] = useState(true);
		const [chatDisabled, setChatDisabled] = useState(false);
		const seenMessageIds = useRef<Set<string>>(new Set());

		// Resolve groupId: use chat_group_id from userState or fall back to sessionId
		const groupId = (userState?.chat_group_id as string) || sessionId || "";

		// Convert API message to ChatMessage with isOwn flag
		const toViewMessage = useCallback(
			(msg: ApiChatMessage | SSEChatMessage): ChatMessage => ({
				messageId: msg.messageId,
				senderId: msg.senderId,
				senderType: msg.senderType,
				content: msg.content,
				createdAt: msg.createdAt,
				isOwn: msg.senderId === sessionId,
			}),
			[sessionId],
		);

		// Load history on mount
		useEffect(() => {
			if (!sessionId || !groupId) return;

			let canceled = false;
			const currentSessionId = sessionId;
			const currentGroupId = groupId;

			async function loadHistory() {
				try {
					const { messages: history } = await getChatHistory(
						currentGroupId,
						currentSessionId,
					);
					if (canceled) return;

					// Track seen message IDs
					for (const msg of history) {
						seenMessageIds.current.add(msg.messageId);
					}

					setMessages(history.map(toViewMessage));
				} catch (error) {
					console.error("[Chat] Failed to load history:", error);
				} finally {
					if (!canceled) setLoading(false);
				}
			}

			loadHistory();

			return () => {
				canceled = true;
			};
		}, [sessionId, groupId, toViewMessage]);

		// Subscribe to SSE chat_ended events
		useEffect(() => {
			if (!sessionId || !groupId) return;

			const unsubscribe = sseClient.on("chat_ended", (data) => {
				const event = data as SSEChatEnded;
				if (event.groupId === groupId) {
					setChatDisabled(true);
				}
			});

			return unsubscribe;
		}, [sessionId, groupId]);

		// Subscribe to SSE chat_message events
		useEffect(() => {
			if (!sessionId || !groupId) return;

			const currentSessionId = sessionId;

			const unsubscribe = sseClient.on("chat_message", (data) => {
				const message = data as SSEChatMessage;

				// Only process messages for our group
				if (message.groupId !== groupId) return;

				// Dedupe by messageId
				if (seenMessageIds.current.has(message.messageId)) return;
				seenMessageIds.current.add(message.messageId);

				setMessages((prev) => [...prev, toViewMessage(message)]);

				// Emit onMessageReceive event if configured
				if (
					component.events?.onMessageReceive &&
					message.senderId !== currentSessionId
				) {
					void emitChatEvent(
						component.id,
						currentSessionId,
						component.events.onMessageReceive,
						{
							messageId: message.messageId,
							senderId: message.senderId,
							senderType: message.senderType,
						},
					);
				}
			});

			return unsubscribe;
		}, [sessionId, groupId, toViewMessage, component.events, component.id]);

		// Handle sending messages
		const handleSend = useCallback(
			async (content: string) => {
				if (!sessionId || !groupId) return;

				try {
					const result = await sendChatMessage(groupId, sessionId, content);

					// Emit onMessageSend event if configured
					if (component.events?.onMessageSend) {
						void emitChatEvent(
							component.id,
							sessionId,
							component.events.onMessageSend,
							{
								messageId: result.messageId,
								content,
							},
						);
					}
				} catch (error) {
					console.error("[Chat] Failed to send message:", error);
				}
			},
			[sessionId, groupId, component.id, component.events],
		);

		if (!sessionId) {
			return (
				<div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
					Chat requires an active session.
				</div>
			);
		}

		if (loading) {
			return (
				<div className="flex h-[500px] items-center justify-center rounded-2xl border border-slate-200 bg-white">
					<div className="text-sm text-slate-400">Loading chat...</div>
				</div>
			);
		}

		return (
			<ChatView
				messages={messages}
				onSend={handleSend}
				placeholder={component.props.placeholder}
				disabled={chatDisabled}
			/>
		);
	},
});

async function emitChatEvent(
	componentId: string | undefined,
	sessionId: string | null | undefined,
	eventConfig: { type?: string; data?: Record<string, unknown> },
	eventData: Record<string, unknown>,
) {
	if (!sessionId) return;

	try {
		await submitEvent(sessionId, {
			type: eventConfig.type ?? "chat_event",
			timestamp: new Date().toISOString(),
			componentType: "chat",
			componentId: componentId ?? "unknown",
			data: {
				...eventConfig.data,
				...eventData,
			},
		});
	} catch (error) {
		console.error("[Chat] Failed to submit event:", error);
	}
}
