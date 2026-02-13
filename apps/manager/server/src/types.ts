/**
 * Shared types for manager server
 */

export type ConfigDocument = {
	configId: string;
	owner: string;
	checksum: string;
	metadata: Record<string, unknown> | null;
	config: unknown;
	requireAuth?: boolean; // Optional auth for lab sessions
	createdAt?: Date;
	updatedAt: Date;
};

export type MediaUploadBody = {
	bucket?: string;
	object: string;
	checksum?: string;
	data: string;
	contentType?: string | null;
	metadata?: Record<string, unknown> | null;
	public?: boolean;
};

export type MediaListItem = {
	name: string;
	bucket: string;
	size?: number;
	updatedAt?: string | null;
	contentType?: string | null;
	publicUrl?: string;
	metadata?: Record<string, unknown> | null;
};

export type ProlificParams = {
	prolificPid: string;
	studyId: string;
	sessionId: string;
};

export type SessionDocument = {
	id: string;
	configId: string;
	config: unknown;
	currentPageId: string;
	user_state: Record<string, unknown>;
	prolific?: ProlificParams | null;
	endedAt: string | null;
	userId?: string | null;
	createdAt: Date;
	updatedAt: Date;
};

export type EventDocument = {
	type: string;
	timestamp: string;
	sessionId: string;
	configId: string;
	pageId: string;
	componentType: string;
	componentId: string;
	data: Record<string, unknown>;
	idempotencyKey: string;
	createdAt: Date;
};

export type ChatMessageDocument = {
	_id?: import("mongodb").ObjectId;
	groupId: string;
	sessionId: string;
	senderId: string;
	senderType: "participant" | "agent" | "system";
	content: string;
	createdAt: Date;
	idempotencyKey?: string;
};
