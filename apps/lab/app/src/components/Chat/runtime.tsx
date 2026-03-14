/**
 * Chat Runtime - Connects ChatView to the runtime system
 * Handles SSE subscription, message history, and event emission
 */

import type { ChatAvatarOverrides } from "@app/lib/participant-icons";
import {
	type ChatMessage as ApiChatMessage,
	getChatHistory,
	getSession,
	NotAMemberError,
	sendChatMessage,
	startChatAgents,
	submitEvent,
} from "@app/lib/api";
import { sseClient } from "@app/lib/sse";
import { defineRuntimeComponent } from "@app/runtime/define-runtime-component";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type ChatMessage, ChatView } from "./ChatView";

type ChatProps = {
	placeholder?: string;
	groupId?: string;
	avatars?: ChatAvatarOverrides;
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

type SSEChatMessageDelta = {
	streamId: string;
	groupId: string;
	senderId: string;
	senderType: "agent";
	delta: string;
	fullText: string;
};

type StreamingMessage = {
	streamId: string;
	senderId: string;
	senderType: "agent";
	content: string;
};

export const ChatRuntime = defineRuntimeComponent<"chat", ChatProps>({
	type: "chat",
	renderer: ({ component, context }) => {
		const {
			sessionId,
			sessionState,
			onSessionStateChange,
			pageId,
			compiledConfig,
		} = context;
		const [messages, setMessages] = useState<ChatMessage[]>([]);
		const [loading, setLoading] = useState(true);
		const [chatDisabled, setChatDisabled] = useState(false);
		const [streamingMessage, setStreamingMessage] =
			useState<StreamingMessage | null>(null);
		const seenMessageIds = useRef<Set<string>>(new Set());
		const hasTriggeredAgents = useRef(false);

		const mergedAvatars = useMemo<ChatAvatarOverrides>(() => {
			const configAgents: Record<string, NonNullable<ChatAvatarOverrides["agent"]>> =
				Object.fromEntries(
					(compiledConfig?.agents ?? [])
						.filter(
							(agent): agent is {
								id: string;
								avatar: NonNullable<ChatAvatarOverrides["agent"]>;
							} => Boolean(agent.avatar),
						)
						.map((agent) => [agent.id, agent.avatar]),
				);

			return {
				...component.props.avatars,
				agents: {
					...configAgents,
					...component.props.avatars?.agents,
				},
			};
		}, [compiledConfig?.agents, component.props.avatars]);

		const [resolvedGroupId, setResolvedGroupId] = useState<string | null>(
			() => {
				if (sessionState?.chat_group_id)
					return sessionState.chat_group_id as string;
				if (component.props.groupId)
					return `${sessionId}:${component.props.groupId}`;
				return null;
			},
		);

		useEffect(() => {
			if (resolvedGroupId || !sessionId) return;

			let canceled = false;
			const currentSessionId = sessionId;

			async function resolve() {
				try {
					const session = await getSession(currentSessionId);
					if (canceled) return;

					const serverGroupId = session.session_state?.chat_group_id as
						| string
						| undefined;
					if (serverGroupId) {
						setResolvedGroupId(serverGroupId);
						onSessionStateChange?.({ chat_group_id: serverGroupId });
					} else {
						setResolvedGroupId(`${sessionId}:${pageId}`);
					}
				} catch (error) {
					if (canceled) return;
					console.error("[Chat] Failed to fetch session for groupId:", error);
					setResolvedGroupId(`${sessionId}:${pageId}`);
				}
			}

			resolve();
			return () => {
				canceled = true;
			};
		}, [resolvedGroupId, sessionId, pageId, onSessionStateChange]);

		const groupId = resolvedGroupId ?? "";

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

					for (const msg of history) {
						seenMessageIds.current.add(msg.messageId);
					}

					setMessages(history.map(toViewMessage));
				} catch (error) {
					if (canceled) return;

					if (error instanceof NotAMemberError) {
						try {
							const session = await getSession(currentSessionId);
							if (canceled) return;

							const serverGroupId = session.session_state?.chat_group_id as
								| string
								| undefined;
							if (serverGroupId && serverGroupId !== currentGroupId) {
								setResolvedGroupId(serverGroupId);
								onSessionStateChange?.({
									chat_group_id: serverGroupId,
								});
								return;
							}
						} catch (fetchError) {
							console.error(
								"[Chat] Failed to re-fetch session after 403:",
								fetchError,
							);
						}
					}

					console.error("[Chat] Failed to load history:", error);
				} finally {
					if (!canceled) setLoading(false);
				}
			}

			loadHistory();

			return () => {
				canceled = true;
			};
		}, [sessionId, groupId, toViewMessage, onSessionStateChange]);

		useEffect(() => {
			if (!sessionId || !groupId || loading) return;
			if (hasTriggeredAgents.current) return;

			hasTriggeredAgents.current = true;

			const timer = setTimeout(() => {
				startChatAgents(groupId, sessionId).catch((error) => {
					console.error("[Chat] Failed to start agents:", error);
				});
			}, 300);

			return () => clearTimeout(timer);
		}, [loading, sessionId, groupId]);

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

		useEffect(() => {
			if (!sessionId || !groupId) return;

			const unsubscribe = sseClient.on("chat_stream_end", (data) => {
				const event = data as { groupId: string };
				if (event.groupId === groupId) {
					setStreamingMessage(null);
				}
			});

			return unsubscribe;
		}, [sessionId, groupId]);

		useEffect(() => {
			if (!sessionId || !groupId) return;

			const unsubscribe = sseClient.on("chat_message_delta", (data) => {
				const delta = data as SSEChatMessageDelta;
				if (delta.groupId !== groupId) return;

				setStreamingMessage({
					streamId: delta.streamId,
					senderId: delta.senderId,
					senderType: delta.senderType,
					content: delta.fullText,
				});
			});

			return unsubscribe;
		}, [sessionId, groupId]);

		useEffect(() => {
			if (!sessionId || !groupId) return;

			const currentSessionId = sessionId;

			const unsubscribe = sseClient.on("chat_message", (data) => {
				const message = data as SSEChatMessage;
				if (message.groupId !== groupId) return;
				if (message.senderId === currentSessionId) return;
				if (seenMessageIds.current.has(message.messageId)) return;
				seenMessageIds.current.add(message.messageId);

				if (message.senderType === "agent") {
					setStreamingMessage(null);
				}

				setMessages((prev) => [...prev, toViewMessage(message)]);

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

		const handleSend = useCallback(
			async (content: string) => {
				if (!sessionId || !groupId) return;

				try {
					const result = await sendChatMessage(groupId, sessionId, content);

					seenMessageIds.current.add(result.messageId);
					setMessages((prev) => [
						...prev,
						{
							messageId: result.messageId,
							senderId: sessionId,
							senderType: "participant" as const,
							content,
							createdAt: result.createdAt,
							isOwn: true,
						},
					]);

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

		if (!resolvedGroupId || loading) {
			return (
				<div className="flex min-h-0 flex-1 items-center justify-center">
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
				streamingMessage={streamingMessage}
				avatars={mergedAvatars}
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
