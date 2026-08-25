import {
	AuthRequiredError,
	LabClient,
	NotAMemberError,
	SessionBlockedError,
} from "./client";
import { SSEClient } from "./sse";

const baseUrl =
	(import.meta as ImportMeta & { env?: { VITE_API_URL?: string } }).env
		?.VITE_API_URL || "";

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
} from "./client";

export const startSession = client.startSession.bind(client);
export const getSession = client.getSession.bind(client);
export const advance = client.advance.bind(client);
export const submitEvent = client.submitEvent.bind(client);
export const updateState = client.updateState.bind(client);
export const sendChatMessage = client.sendChatMessage.bind(client);
export const getChatHistory = client.getChatHistory.bind(client);
export const startChatAgents = client.startChatAgents.bind(client);
export const joinMatchmaking = client.joinMatchmaking.bind(client);
export const cancelMatchmaking = client.cancelMatchmaking.bind(client);
export const getWorkspace = client.getWorkspace.bind(client);
export const updateWorkspace = client.updateWorkspace.bind(client);
export const randomize = client.randomize.bind(client);
