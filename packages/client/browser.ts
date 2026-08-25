import type {
	CancelMatchmakingResponse,
	ChatAvatar,
	ChatMessage,
	GetChatHistoryResponse,
	GetResponse,
	GetWorkspaceResponse,
	MatchmakingParams,
	MatchmakingResponse,
	ProlificParams,
	RandomizeParams,
	RandomizeResponse,
	SendChatMessageResponse,
	StartResponse,
	SubmitEventResponse,
	UpdateWorkspaceResponse,
	WorkspaceDocument,
} from "./client";
import {
	AuthRequiredError,
	LabClient,
	NotAMemberError,
	SessionBlockedError,
} from "./client";
import { SSEClient } from "./sse";
import type { EventPayload } from "./types";

function viteApiUrl(): string {
	const meta = import.meta as ImportMeta & {
		env?: { VITE_API_URL?: string };
	};
	return meta.env?.VITE_API_URL || "";
}

const baseUrl = viteApiUrl();
const client = new LabClient({
	baseUrl,
	credentials: "include",
});

export const sseClient = new SSEClient({
	baseUrl,
	withCredentials: true,
});

export { AuthRequiredError, NotAMemberError, SessionBlockedError };
export type {
	CancelMatchmakingResponse,
	ChatAvatar,
	ChatMessage,
	MatchmakingParams,
	MatchmakingResponse,
	ProlificParams,
	RandomizeParams,
	RandomizeResponse,
	WorkspaceDocument,
};

export function startSession(
	configId: string,
	prolific?: ProlificParams | null,
): Promise<StartResponse> {
	return client.startSession(configId, prolific);
}

export function getSession(sessionId: string): Promise<GetResponse> {
	return client.getSession(sessionId);
}

export function advance(
	sessionId: string,
	target: string,
): Promise<GetResponse> {
	return client.advance(sessionId, target);
}

export function submitEvent(
	sessionId: string,
	event: EventPayload,
): Promise<SubmitEventResponse> {
	return client.submitEvent(sessionId, event);
}

export function updateState(
	sessionId: string,
	updates: Record<string, unknown>,
): Promise<void> {
	return client.updateState(sessionId, updates);
}

export function sendChatMessage(
	groupId: string,
	sessionId: string,
	content: string,
): Promise<SendChatMessageResponse> {
	return client.sendChatMessage(groupId, sessionId, content);
}

export function getChatHistory(
	groupId: string,
	sessionId: string,
): Promise<GetChatHistoryResponse> {
	return client.getChatHistory(groupId, sessionId);
}

export function startChatAgents(
	groupId: string,
	sessionId: string,
	idempotencyKey?: string,
): Promise<void> {
	return client.startChatAgents(groupId, sessionId, idempotencyKey);
}

export function joinMatchmaking(
	sessionId: string,
	params: MatchmakingParams,
): Promise<MatchmakingResponse> {
	return client.joinMatchmaking(sessionId, params);
}

export function cancelMatchmaking(
	sessionId: string,
	poolId: string,
): Promise<CancelMatchmakingResponse> {
	return client.cancelMatchmaking(sessionId, poolId);
}

export function getWorkspace(
	groupId: string,
	sessionId: string,
): Promise<GetWorkspaceResponse> {
	return client.getWorkspace(groupId, sessionId);
}

export function updateWorkspace(
	groupId: string,
	sessionId: string,
	update: {
		content?: string;
		fields?: Record<string, unknown>;
		mode?: "freeform" | "structured";
		configId?: string;
	},
): Promise<UpdateWorkspaceResponse> {
	return client.updateWorkspace(groupId, sessionId, update);
}

export function randomize(
	sessionId: string,
	params: RandomizeParams = {},
): Promise<RandomizeResponse> {
	return client.randomize(sessionId, params);
}
