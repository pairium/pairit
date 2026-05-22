const baseUrl = import.meta.env.VITE_API_URL || "";

export class ApiError extends Error {
	constructor(
		public status: number,
		public code: string,
		message: string,
	) {
		super(message);
		this.name = "ApiError";
	}
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
	const res = await fetch(`${baseUrl}${path}`, {
		credentials: "include",
		...init,
		headers: {
			"Content-Type": "application/json",
			...(init.headers || {}),
		},
	});
	const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
	if (!res.ok) {
		throw new ApiError(
			res.status,
			(body.error as string) || "error",
			(body.message as string) || res.statusText,
		);
	}
	return body as T;
}

export type ConfigSummary = {
	configId: string;
	owner: string;
	checksum: string;
	updatedAt: string | null;
	metadata: Record<string, unknown> | null;
	llmCredentials: Record<string, unknown> | null;
};

export type ConfigDetail = ConfigSummary & {
	config: unknown;
	rawYaml: string | null;
	createdAt: string | null;
	requireAuth: boolean;
	allowRetake: boolean;
};

export type SessionStatus = "completed" | "in_progress" | "abandoned";

export type SessionExport = {
	sessionId: string;
	configId: string;
	currentPageId: string;
	status: SessionStatus;
	session_state: Record<string, unknown>;
	prolific: unknown;
	userId: string | null;
	createdAt: string | null;
	updatedAt: string | null;
	endedAt: string | null;
};

export type EventExport = {
	sessionId: string;
	type: string;
	pageId: string;
	componentType: string;
	componentId: string;
	data: Record<string, unknown>;
	timestamp: string;
	createdAt: string | null;
};

export type GroupExport = {
	groupId: string;
	sessionId: string;
	poolId: string;
	treatment: string;
	matchedAt: string | null;
	status: "active" | "completed";
};

export type ChatMessageExport = {
	messageId: string | null;
	groupId: string;
	senderId: string;
	senderType: "participant" | "agent" | "system";
	content: string;
	createdAt: string | null;
};

export type SurveyResponseExport = {
	sessionId: string;
	pageId: string;
	componentId: string;
	timestamp: string;
	data: Record<string, unknown>;
};

export type WorkspaceDocumentExport = {
	groupId: string;
	mode: "freeform" | "structured";
	content: string | null;
	fields: Record<string, unknown> | null;
	updatedBy: string;
	createdAt: string | null;
	updatedAt: string | null;
};

export type MediaObject = {
	name: string;
	bucket: string;
	size?: number;
	updatedAt: string | null;
	contentType: string | null;
	publicUrl?: string;
	metadata: Record<string, unknown> | null;
};

export type Me = {
	id: string;
	email: string;
	isAdmin: boolean;
};

export type RecentSession = {
	sessionId: string;
	configId: string;
	currentPageId: string;
	status: SessionStatus;
	userId: string | null;
	createdAt: string | null;
	updatedAt: string | null;
};

export type ConfigCounts = {
	sessions: number;
	events: number;
	groups: number;
	chatMessages: number;
	workspaceDocuments: number;
	surveys: number;
};

export type AllowlistUser = {
	email: string;
	isAdmin: boolean;
	addedAt?: string;
	addedBy?: string;
};

export type Page<T> = { items: T[]; nextCursor: string | null };

function paginated<T>(payload: Record<string, unknown>, key: string): Page<T> {
	return {
		items: (payload[key] as T[]) ?? [],
		nextCursor: (payload.nextCursor as string | null) ?? null,
	};
}

function qs(params: Record<string, string | undefined>): string {
	const search = new URLSearchParams();
	for (const [k, v] of Object.entries(params)) {
		if (v !== undefined && v !== "") search.set(k, v);
	}
	const str = search.toString();
	return str ? `?${str}` : "";
}

export const api = {
	me: () => request<Me>("/me"),

	listConfigs: () =>
		request<{ configs: ConfigSummary[] }>("/configs").then((r) => r.configs),

	getConfig: (configId: string) =>
		request<ConfigDetail>(`/configs/${encodeURIComponent(configId)}`),

	uploadConfig: (body: {
		configId: string;
		checksum: string;
		config: unknown;
		metadata?: Record<string, unknown> | null;
		requireAuth?: boolean;
		allowRetake?: boolean;
	}) =>
		request<ConfigDetail>("/configs/upload", {
			method: "POST",
			body: JSON.stringify(body),
		}),

	uploadConfigYaml: (body: { configId?: string; yaml: string }) =>
		request<ConfigDetail>("/configs/yaml", {
			method: "POST",
			body: JSON.stringify(body),
		}),

	deleteConfig: (configId: string) =>
		request<{ configId: string }>(`/configs/${encodeURIComponent(configId)}`, {
			method: "DELETE",
		}),

	listRecentSessions: () =>
		request<{ sessions: RecentSession[] }>("/data/recent").then(
			(r) => r.sessions,
		),

	getCounts: (configId: string) =>
		request<ConfigCounts>(`/data/${encodeURIComponent(configId)}/counts`),

	listSessions: (configId: string, since?: string, limit?: string) =>
		request<Record<string, unknown>>(
			`/data/${encodeURIComponent(configId)}/sessions${qs({ since, limit })}`,
		).then((r) => paginated<SessionExport>(r, "sessions")),

	getSession: (configId: string, sessionId: string) =>
		request<SessionExport>(
			`/data/${encodeURIComponent(configId)}/sessions/${encodeURIComponent(sessionId)}`,
		),

	listEvents: (
		configId: string,
		since?: string,
		limit?: string,
		sessionId?: string,
	) =>
		request<Record<string, unknown>>(
			`/data/${encodeURIComponent(configId)}/events${qs({ since, limit, sessionId })}`,
		).then((r) => paginated<EventExport>(r, "events")),

	listGroups: (configId: string, since?: string, limit?: string) =>
		request<Record<string, unknown>>(
			`/data/${encodeURIComponent(configId)}/groups${qs({ since, limit })}`,
		).then((r) => paginated<GroupExport>(r, "groups")),

	listChatMessages: (configId: string, since?: string, limit?: string) =>
		request<Record<string, unknown>>(
			`/data/${encodeURIComponent(configId)}/chat-messages${qs({ since, limit })}`,
		).then((r) => paginated<ChatMessageExport>(r, "messages")),

	listSurveyResponses: (configId: string, since?: string, limit?: string) =>
		request<Record<string, unknown>>(
			`/data/${encodeURIComponent(configId)}/survey-responses${qs({ since, limit })}`,
		).then((r) => paginated<SurveyResponseExport>(r, "surveyResponses")),

	listWorkspaceDocuments: (configId: string, since?: string, limit?: string) =>
		request<Record<string, unknown>>(
			`/data/${encodeURIComponent(configId)}/workspace-documents${qs({ since, limit })}`,
		).then((r) => paginated<WorkspaceDocumentExport>(r, "workspaceDocuments")),

	uploadMedia: (
		object: string,
		dataBase64: string,
		contentType: string | null,
	) =>
		request<MediaObject>("/media/upload", {
			method: "POST",
			body: JSON.stringify({ object, data: dataBase64, contentType }),
		}),

	listMedia: (prefix?: string) =>
		request<{ objects: MediaObject[] }>(`/media${qs({ prefix })}`).then(
			(r) => r.objects,
		),

	deleteMedia: (object: string) =>
		request<{ object: string }>(`/media/${encodeURIComponent(object)}`, {
			method: "DELETE",
		}),

	listAllowlist: () =>
		request<{ users: AllowlistUser[] }>("/admin/users").then((r) => r.users),

	addAllowlistUser: (email: string, isAdmin: boolean) =>
		request<{ user: AllowlistUser }>("/admin/users", {
			method: "POST",
			body: JSON.stringify({ email, isAdmin }),
		}).then((r) => r.user),

	removeAllowlistUser: (email: string) =>
		request<{ email: string }>(`/admin/users/${encodeURIComponent(email)}`, {
			method: "DELETE",
		}),
};
