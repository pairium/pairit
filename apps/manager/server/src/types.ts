/**
 * Types for manager server
 * Re-exports shared document types and defines manager-specific types
 */

export type {
	ChatMessageDocument,
	ConfigDocument,
	EventDocument,
	GroupDocument,
	ProlificParams,
	SessionDocument,
	WorkspaceDocument as WorkspaceDocumentDocument,
} from "@pairit/db/types";

export type MediaListItem = {
	name: string;
	bucket: string;
	size?: number;
	updatedAt?: string | null;
	contentType?: string | null;
	publicUrl?: string;
	metadata?: Record<string, unknown> | null;
};
