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
		body: JSON.stringify({ target }),
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
		body: JSON.stringify(event),
	});
	if (!r.ok) throw new Error("Failed to submit event");
	return r.json();
}
