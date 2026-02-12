import type { EventPayload, Page } from "../runtime/types";

const baseUrl = import.meta.env.VITE_API_URL || "";

export type ProlificParams = {
	prolificPid: string;
	studyId: string;
	sessionId: string;
};

export class AuthRequiredError extends Error {
	constructor() {
		super("Authentication required");
		this.name = "AuthRequiredError";
	}
}

type StartResponse = {
	sessionId: string;
	configId: string;
	currentPageId: string;
	page: Page;
};
type GetResponse = {
	sessionId: string;
	currentPageId: string;
	page: Page;
	endedAt: string | null;
};
type AdvanceResponse = GetResponse;
type SubmitEventResponse = { eventId: string };

export async function startSession(
	configId: string,
	prolific?: ProlificParams | null,
): Promise<StartResponse> {
	const r = await fetch(`${baseUrl}/sessions/start`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		credentials: "include", // Include cookies for Better Auth
		body: JSON.stringify({ configId, ...(prolific && { prolific }) }),
	});
	if (r.status === 401) {
		throw new AuthRequiredError();
	}
	if (!r.ok) throw new Error("Failed to start session");
	return r.json();
}

export async function getSession(sessionId: string): Promise<GetResponse> {
	const r = await fetch(`${baseUrl}/sessions/${sessionId}`, {
		credentials: "include",
	});
	if (!r.ok) throw new Error("Session not found");
	return r.json();
}

export async function advance(
	sessionId: string,
	target: string,
): Promise<AdvanceResponse> {
	const r = await fetch(`${baseUrl}/sessions/${sessionId}/advance`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		credentials: "include",
		body: JSON.stringify({ target, idempotencyKey: crypto.randomUUID() }),
	});
	if (!r.ok) throw new Error("Failed to advance");
	return r.json();
}

export async function submitEvent(
	sessionId: string,
	event: EventPayload,
): Promise<SubmitEventResponse> {
	const r = await fetch(`${baseUrl}/sessions/${sessionId}/events`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		credentials: "include",
		body: JSON.stringify({ ...event, idempotencyKey: crypto.randomUUID() }),
	});
	if (!r.ok) throw new Error("Failed to submit event");
	return r.json();
}

export async function updateState(
	sessionId: string,
	updates: Record<string, unknown>,
): Promise<void> {
	const r = await fetch(`${baseUrl}/sessions/${sessionId}/state`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		credentials: "include",
		body: JSON.stringify({ updates, idempotencyKey: crypto.randomUUID() }),
	});
	if (!r.ok) throw new Error("Failed to update state");
}

// Chat API

export type ChatMessage = {
	messageId: string;
	groupId: string;
	sessionId: string;
	senderId: string;
	senderType: "participant" | "agent" | "system";
	content: string;
	createdAt: string;
};

type SendChatMessageResponse = {
	messageId: string;
	createdAt: string;
	deduplicated?: boolean;
};

type GetChatHistoryResponse = {
	messages: ChatMessage[];
};

export async function sendChatMessage(
	groupId: string,
	sessionId: string,
	content: string,
): Promise<SendChatMessageResponse> {
	const r = await fetch(`${baseUrl}/chat/${groupId}/send`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		credentials: "include",
		body: JSON.stringify({
			sessionId,
			content,
			idempotencyKey: crypto.randomUUID(),
		}),
	});
	if (!r.ok) throw new Error("Failed to send message");
	return r.json();
}

export async function getChatHistory(
	groupId: string,
	sessionId: string,
): Promise<GetChatHistoryResponse> {
	const r = await fetch(
		`${baseUrl}/chat/${groupId}/history?sessionId=${encodeURIComponent(sessionId)}`,
		{
			credentials: "include",
		},
	);
	if (!r.ok) throw new Error("Failed to get chat history");
	return r.json();
}
