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

export type AdvanceResponse = GetResponse;
export type SubmitEventResponse = { eventId: string };

export type ChatAvatar = {
	icon?: string;
	image?: string;
};

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

export type WorkspaceDocument = {
	groupId: string;
	mode: "freeform" | "structured";
	content?: string;
	fields?: Record<string, unknown>;
	updatedBy: string;
	updatedAt: string;
};

export type GetWorkspaceResponse = {
	document: WorkspaceDocument | null;
};

export type UpdateWorkspaceResponse = {
	ok: boolean;
	updatedAt: string;
};

export type RandomizeParams = {
	assignmentType?: "random" | "balanced_random" | "block";
	conditions?: string[];
	stateKey?: string;
	scope?: "session" | "group";
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

	private jsonRequest(path: string, body: unknown): Promise<Response> {
		return this.request(path, {
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

	async advance(sessionId: string, target: string): Promise<AdvanceResponse> {
		const r = await this.jsonRequest(`/sessions/${sessionId}/advance`, {
			target,
			idempotencyKey: crypto.randomUUID(),
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

	async getWorkspace(
		groupId: string,
		sessionId: string,
	): Promise<GetWorkspaceResponse> {
		const r = await this.request(
			`/workspace/${groupId}?sessionId=${encodeURIComponent(sessionId)}`,
		);
		if (r.status === 403) throw new NotAMemberError();
		if (!r.ok) throw new Error("Failed to get workspace");
		return r.json();
	}

	async updateWorkspace(
		groupId: string,
		sessionId: string,
		update: {
			content?: string;
			fields?: Record<string, unknown>;
			mode?: "freeform" | "structured";
			configId?: string;
		},
	): Promise<UpdateWorkspaceResponse> {
		const r = await this.jsonRequest(`/workspace/${groupId}/update`, {
			sessionId,
			...update,
		});
		if (r.status === 403) throw new NotAMemberError();
		if (!r.ok) throw new Error("Failed to update workspace");
		return r.json();
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
