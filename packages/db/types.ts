/**
 * Shared MongoDB document types
 * Used by both lab and manager servers
 */

import type { ObjectId } from "mongodb";

export type EncryptedSecret = {
	iv: string;
	ciphertext: string;
	authTag: string;
};

export type ConfigLlmCredentials = {
	openai?: EncryptedSecret;
	anthropic?: EncryptedSecret;
};

export type ConfigDocument = {
	configId: string;
	owner?: string;
	// Researcher-chosen name, unique per owner. Legacy configs have none.
	name?: string;
	// Bumped when an upload changes the compiled config. Legacy configs have none.
	revision?: number;
	checksum?: string;
	metadata?: Record<string, unknown> | null;
	config: unknown;
	llmCredentials?: ConfigLlmCredentials;
	requireAuth?: boolean;
	allowRetake?: boolean;
	createdAt?: Date | null;
	updatedAt?: Date | null;
};

// Snapshot of a config at one revision. Credentials are never copied.
export type ConfigRevisionDocument = {
	configId: string;
	revision: number;
	checksum: string | null;
	config: unknown;
	metadata: Record<string, unknown> | null;
	requireAuth: boolean;
	allowRetake: boolean;
	uploadedBy: string | null;
	createdAt: Date;
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
	session_state: Record<string, unknown>;
	prolific?: ProlificParams | null;
	endedAt: string | null;
	userId?: string | null;
	simulated?: boolean;
	simulationRunId?: string;
	personaId?: string;
	// Provenance: which config revision and lab build served this session
	configRevision?: number | null;
	configChecksum?: string | null;
	labVersion?: string | null;
	labRevision?: string | null;
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

export type ChatMessageAvatar = {
	icon?: string;
	image?: string;
};

export type ChatMessageDocument = {
	_id?: ObjectId;
	groupId: string;
	sessionId: string;
	configId: string;
	senderId: string;
	senderType: "participant" | "agent" | "system";
	content: string;
	createdAt: Date;
	avatar?: ChatMessageAvatar;
	idempotencyKey?: string;
};

export type GroupDocument = {
	groupId: string;
	configId: string;
	poolId: string;
	memberSessionIds: string[];
	treatment: string;
	// Group-scoped randomization results, keyed by stateKey (first writer wins)
	assignments?: Record<string, string>;
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
