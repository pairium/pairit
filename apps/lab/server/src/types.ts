/**
 * Shared types for lab server
 * (Duplicated from original Firebase Functions implementation)
 */

export type ButtonAction = { type: "go_to"; target: string };
export type Button = { id: string; text: string; action: ButtonAction };
export type ComponentInstance =
	| { type: "text"; props: { text: string } }
	| { type: "buttons"; props: { buttons: Button[] } };

export type Page = {
	id: string;
	end?: boolean;
	components?: ComponentInstance[];
};

export type Config = {
	initialPageId: string;
	pages: Record<string, Page>;
};

export type ConfigDocument = {
	configId: string;
	owner?: string;
	checksum?: string;
	metadata?: Record<string, unknown> | null;
	config: unknown;
	requireAuth?: boolean; // Optional auth for lab sessions
	createdAt?: Date | null;
	updatedAt?: Date | null;
};

export type ProlificParams = {
	prolificPid: string;
	studyId: string;
	sessionId: string;
};

export type Session = {
	id: string;
	configId: string;
	config: Config;
	currentPageId: string;
	user_state: Record<string, any>;
	prolific?: ProlificParams | null;
	endedAt?: string;
	createdAt?: Date;
	updatedAt?: Date;
};

export type SessionDocument = {
	id: string;
	configId: string;
	config: Config;
	currentPageId: string;
	user_state: Record<string, unknown>;
	prolific?: ProlificParams | null;
	endedAt: string | null;
	userId?: string | null; // User ID from Better Auth (null for anonymous/public sessions)
	createdAt: Date;
	updatedAt: Date;
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

export type EventDocument = Event & {
	createdAt: Date;
};
