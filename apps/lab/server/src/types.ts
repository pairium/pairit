/**
 * Types for lab server
 * Re-exports shared document types and defines lab-specific types
 */

import type {
	ProlificParams as _ProlificParams,
	SessionDocument as BaseSessionDocument,
} from "@pairit/db/types";

export type {
	ChatMessageDocument,
	ConfigDocument,
	EventDocument,
	GroupDocument,
	ProlificParams,
	WorkspaceDocument as WorkspaceDocumentDocument,
} from "@pairit/db/types";

type ButtonAction = {
	type: "go_to";
	target: string;
	setState?: Record<string, unknown>;
};
type Button = { id: string; text: string; action: ButtonAction };
type ComponentInstance =
	| { type: "text"; props: { text: string } }
	| { type: "buttons"; props: { buttons: Button[] } };

export type Page = {
	id: string;
	end?: boolean;
	layout?: "split";
	components?: ComponentInstance[];
};

export type Config = {
	initialPageId: string;
	pages: Record<string, Page>;
};

/** Lab-specific SessionDocument with typed config */
export type SessionDocument = Omit<BaseSessionDocument, "config"> & {
	config: Config;
};

export type Session = {
	id: string;
	configId: string;
	config: Config;
	currentPageId: string;
	session_state: Record<string, unknown>;
	prolific?: _ProlificParams | null;
	endedAt?: string;
	createdAt?: Date;
	updatedAt?: Date;
};

export type Event = {
	type: string;
	timestamp: string;
	sessionId: string;
	configId: string;
	pageId: string;
	componentType: string;
	componentId: string;
	data: Record<string, unknown>;
};

export type IdempotencyRecord = {
	key: string;
	createdAt: Date;
};
