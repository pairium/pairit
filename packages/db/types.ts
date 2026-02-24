/**
 * Shared MongoDB document types
 * Used by both lab and manager servers
 */

import type { ObjectId } from "mongodb";

export type ConfigDocument = {
	configId: string;
	owner?: string;
	checksum?: string;
	metadata?: Record<string, unknown> | null;
	config: unknown;
	requireAuth?: boolean;
	allowRetake?: boolean;
	createdAt?: Date | null;
	updatedAt?: Date | null;
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
	_id?: ObjectId;
	groupId: string;
	sessionId: string;
	senderId: string;
	senderType: "participant" | "agent" | "system";
	content: string;
	createdAt: Date;
	idempotencyKey?: string;
};

export type GroupDocument = {
	groupId: string;
	configId: string;
	poolId: string;
	memberSessionIds: string[];
	treatment: string;
	matchedAt: Date;
	status: "active" | "completed";
};

export type WorkspaceDocument = {
	_id?: ObjectId;
	groupId: string;
	mode: "freeform" | "structured";
	content?: string;
	fields?: Record<string, unknown>;
	updatedBy: string;
	configId: string;
	updatedAt: Date;
	createdAt: Date;
};
