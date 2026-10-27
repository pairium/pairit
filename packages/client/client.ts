import type { CompiledConfig, EventPayload, Page } from "./types";

export type LabClientOptions = {
	baseUrl: string;
	credentials?: RequestCredentials;
};

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

export class SessionBlockedError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "SessionBlockedError";
	}
}

export class NotAMemberError extends Error {
	constructor() {
		super("Not a member of this chat group");
		this.name = "NotAMemberError";
	}
}

/** The server refused a workspace request; sending it again won't help. */
export class WorkspaceRefusedError extends Error {
	constructor(readonly code: string) {
		super(`Workspace request refused: ${code}`);
		this.name = "WorkspaceRefusedError";
	}
}

export type StartResponse = {
	status?: "created" | "resumed" | "blocked";
	sessionId: string;
	configId: string;
	config: CompiledConfig;
	currentPageId: string;
	page: Page;
	session_state?: Record<string, unknown>;
	endedAt?: string | null;
	error?: string;
	message?: string;
};

export type GetResponse = {
	sessionId: string;
	currentPageId: string;
	page: Page;
	endedAt: string | null;
	session_state?: Record<string, unknown>;
};

export type SubmitEventResponse = { eventId: string };

// Lucide icon name or image path/URL
export type ChatAvatar = string;

export type ChatMessage = {
	messageId: string;
	groupId: string;
	sessionId: string;
	senderId: string;
	senderType: "participant" | "agent" | "system";
	content: string;
	createdAt: string;
	avatar?: ChatAvatar;
};

export type SendChatMessageResponse = {
	messageId: string;
	createdAt: string;
	avatar?: ChatAvatar;
	deduplicated?: boolean;
	messagesSent?: number;
};

export type GetChatHistoryResponse = {
	messages: ChatMessage[];
};

export type MatchmakingParams = {
	poolId: string;
	num_users: number;
	timeoutSeconds: number;
	timeoutTarget?: string;
	assignmentType?: "random" | "balanced_random" | "block";
	conditions?: string[];
};

export type MatchmakingResponse =
	| { status: "waiting"; position: number }
	| { status: "matched"; groupId: string; treatment: string };

export type CancelMatchmakingResponse =
	| { status: "cancelled" }
	| { status: "not_found" };

export type SyncWorkspaceResponse = {
	mode: "freeform" | "structured";
	// Base64 Yjs update with what the client lacks
	update: string;
	// Base64 state vector of the server's doc
	stateVector: string;
};

export type RandomizeParams = {
	assignmentType?: "random" | "balanced_random" | "block";
	conditions?: string[];
	stateKey?: string;
	scope?: "session" | "group";
	distribute?: boolean;
};

export type RandomizeResponse = {
	condition: string;
	existing: boolean;
};

export class LabClient {
	readonly baseUrl: string;
	readonly credentials: RequestCredentials;

	constructor(options: LabClientOptions) {
		this.baseUrl = options.baseUrl;
		this.credentials = options.credentials ?? "include";
	}

	private request(path: string, init: RequestInit = {}): Promise<Response> {
		return fetch(`${this.baseUrl}${path}`, {
			...init,
			credentials: this.credentials,
		});
	}

	private jsonRequest(
		path: string,
		body: unknown,
		init: RequestInit = {},
	): Promise<Response> {
		return this.request(path, {
			...init,
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
	}

	async startSession(
		configId: string,
		prolific?: ProlificParams | null,
	): Promise<StartResponse> {
		const r = await this.jsonRequest("/sessions/start", {
			configId,
			...(prolific && { prolific }),
		});
		if (r.status === 401) {
			throw new AuthRequiredError();
		}
		if (r.status === 409) {
			const data = await r.json();
			throw new SessionBlockedError(
				data.message || "You have already completed this experiment.",
			);
		}
		if (!r.ok) throw new Error("Failed to start session");
		return r.json();
	}

	async getSession(sessionId: string): Promise<GetResponse> {
		const r = await this.request(`/sessions/${sessionId}`);
		if (!r.ok) throw new Error("Session not found");
		return r.json();
	}

	async advance(
		sessionId: string,
		target: string,
		idempotencyKey?: string,
	): Promise<GetResponse> {
		const r = await this.jsonRequest(`/sessions/${sessionId}/advance`, {
			target,
			idempotencyKey: idempotencyKey ?? crypto.randomUUID(),
		});
		if (!r.ok) throw new Error("Failed to advance");
		return r.json();
	}

	async submitEvent(
		sessionId: string,
		event: EventPayload,
	): Promise<SubmitEventResponse> {
		const r = await this.jsonRequest(`/sessions/${sessionId}/events`, {
			...event,
			idempotencyKey: crypto.randomUUID(),
		});
		if (!r.ok) throw new Error("Failed to submit event");
		return r.json();
	}

	async updateState(
		sessionId: string,
		updates: Record<string, unknown>,
	): Promise<void> {
		const r = await this.jsonRequest(`/sessions/${sessionId}/state`, {
			updates,
			idempotencyKey: crypto.randomUUID(),
		});
		if (!r.ok) throw new Error("Failed to update state");
	}

	async sendChatMessage(
		groupId: string,
		sessionId: string,
		content: string,
	): Promise<SendChatMessageResponse> {
		const r = await this.jsonRequest(`/chat/${groupId}/send`, {
			sessionId,
			content,
			idempotencyKey: crypto.randomUUID(),
		});
		if (r.status === 403) throw new NotAMemberError();
		if (!r.ok) throw new Error("Failed to send message");
		return r.json();
	}

	async getChatHistory(
		groupId: string,
		sessionId: string,
	): Promise<GetChatHistoryResponse> {
		const r = await this.request(
			`/chat/${groupId}/history?sessionId=${encodeURIComponent(sessionId)}`,
		);
		if (r.status === 403) throw new NotAMemberError();
		if (!r.ok) throw new Error("Failed to get chat history");
		return r.json();
	}

	async startChatAgents(
		groupId: string,
		sessionId: string,
		idempotencyKey?: string,
	): Promise<void> {
		const r = await this.jsonRequest(`/chat/${groupId}/start-agents`, {
			sessionId,
			...(idempotencyKey && { idempotencyKey }),
		});
		if (r.status === 403) throw new NotAMemberError();
		if (!r.ok) throw new Error("Failed to start chat agents");
	}

	async joinMatchmaking(
		sessionId: string,
		params: MatchmakingParams,
	): Promise<MatchmakingResponse> {
		const r = await this.jsonRequest(
			`/sessions/${sessionId}/matchmake`,
			params,
		);
		if (!r.ok) throw new Error("Failed to join matchmaking");
		return r.json();
	}

	async cancelMatchmaking(
		sessionId: string,
		poolId: string,
	): Promise<CancelMatchmakingResponse> {
		const r = await this.jsonRequest(
			`/sessions/${sessionId}/matchmake/cancel`,
			{
				poolId,
			},
		);
		if (!r.ok) throw new Error("Failed to cancel matchmaking");
		return r.json();
	}

	async syncWorkspace(
		groupId: string,
		sessionId: string,
		pageId: string,
		stateVector: string,
	): Promise<SyncWorkspaceResponse> {
		const r = await this.jsonRequest(`/workspace/${groupId}/sync`, {
			sessionId,
			pageId,
			stateVector,
		});
		await throwIfWorkspaceRefused(r);
		if (!r.ok) throw new Error("Failed to sync workspace");
		return r.json();
	}

	async pushWorkspaceUpdate(
		groupId: string,
		sessionId: string,
		pageId: string,
		update: string,
		// For a last save as the page closes; the browser caps the body at 64 KB.
		options: { keepalive?: boolean } = {},
	): Promise<void> {
		const r = await this.jsonRequest(
			`/workspace/${groupId}/update`,
			{ sessionId, pageId, update },
			{ keepalive: options.keepalive },
		);
		await throwIfWorkspaceRefused(r);
		if (!r.ok) throw new Error("Failed to save workspace");
	}

	/** A custom renderer's checked edit; refused if `old` doesn't match once. */
	async replaceInWorkspace(
		groupId: string,
		sessionId: string,
		pageId: string,
		oldText: string,
		newText: string,
	): Promise<{ ok: true } | { ok: false; error: string }> {
		const r = await this.jsonRequest(`/workspace/${groupId}/replace`, {
			sessionId,
			pageId,
			old: oldText,
			new: newText,
		});
		if (r.status === 409) {
			const body = (await r.json()) as { message?: string };
			return { ok: false, error: body.message ?? "Refused" };
		}
		await throwIfWorkspaceRefused(r);
		if (!r.ok) throw new Error("Failed to edit workspace");
		return { ok: true };
	}

	async randomize(
		sessionId: string,
		params: RandomizeParams = {},
	): Promise<RandomizeResponse> {
		const r = await this.jsonRequest(
			`/sessions/${sessionId}/randomize`,
			params,
		);
		if (!r.ok) throw new Error("Failed to randomize");
		return r.json();
	}
}

async function throwIfWorkspaceRefused(r: Response): Promise<void> {
	if (r.status < 400 || r.status >= 500) return;
	const body = (await r.json().catch(() => ({}))) as { error?: string };
	if (body.error === "not_a_member") throw new NotAMemberError();
	throw new WorkspaceRefusedError(body.error ?? String(r.status));
}
