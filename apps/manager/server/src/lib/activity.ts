/**
 * Admin activity report: which configs have participants right now.
 *
 * Pure functions over documents the loader in activity-db.ts reads, so the
 * active / waiting / group logic can be tested without a database.
 */
import type { ConfigDocument, SessionDocument } from "../types";

// A session counts as active if it changed this recently and has not ended.
export const ACTIVE_WINDOW_MS = 15 * 60 * 1000;
export const STARTED_TODAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_SINCE_MS = 24 * 60 * 60 * 1000;

export type ActiveSession = Pick<
	SessionDocument,
	"configId" | "currentPageId" | "session_state" | "config"
>;

export type SessionCounts = {
	total: number;
	startedToday: number;
	prolific: number;
};

export type ActivityInput = {
	now: Date;
	since: Date;
	// Configs with any session updated since `since`, and when
	lastActivity: Map<string, Date>;
	// Live config docs, keyed by configId. Missing if the config was deleted.
	configs: Map<string, ConfigDocument>;
	// Owner user id -> email
	ownerEmails: Map<string, string>;
	// Unfinished sessions updated within ACTIVE_WINDOW_MS of `now`
	activeSessions: ActiveSession[];
	counts: Map<string, SessionCounts>;
};

export type ConfigFeatures = {
	chat: boolean;
	liveWorkspace: boolean;
	html: boolean;
	agents: boolean;
};

export type ConfigActivity = {
	configId: string;
	name: string | null;
	ownerId: string | null;
	ownerEmail: string | null;
	revision: number | null;
	updatedAt: string | null;
	lastActivityAt: string | null;
	activeNow: { total: number; inGroup: number; solo: number };
	waitingInMatchmaking: number;
	startedToday: number;
	totalSessions: number;
	prolificSessions: number;
	isGroupStudy: boolean;
	features: ConfigFeatures;
};

export type ActivityReport = {
	generatedAt: string;
	since: string;
	activeWindowMinutes: number;
	configs: ConfigActivity[];
	liveGroupStudies: ConfigActivity[];
};

type Component = { type?: unknown };
type Page = { id?: unknown; components?: unknown };

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

// Compiled configs key pages by id; older ones may list them.
function getPages(config: unknown): Page[] {
	const pages = asRecord(config)?.pages;
	if (Array.isArray(pages)) return pages as Page[];
	const record = asRecord(pages);
	return record ? (Object.values(record) as Page[]) : [];
}

function getPage(config: unknown, pageId: string): Page | null {
	const pages = asRecord(config)?.pages;
	if (Array.isArray(pages)) {
		return (pages as Page[]).find((page) => page?.id === pageId) ?? null;
	}
	return (asRecord(pages)?.[pageId] as Page | undefined) ?? null;
}

function componentTypes(page: Page | null): string[] {
	if (!page || !Array.isArray(page.components)) return [];
	return (page.components as Component[])
		.map((component) => component?.type)
		.filter((type): type is string => typeof type === "string");
}

export function configComponentTypes(config: unknown): Set<string> {
	return new Set(getPages(config).flatMap(componentTypes));
}

export function isGroupStudy(config: unknown): boolean {
	const matchmaking = asRecord(config)?.matchmaking ?? null;
	const hasPool = Array.isArray(matchmaking)
		? matchmaking.length > 0
		: matchmaking !== null;
	return hasPool || configComponentTypes(config).has("matchmaking");
}

export function configFeatures(config: unknown): ConfigFeatures {
	const types = configComponentTypes(config);
	const agents = asRecord(config)?.agents;
	return {
		chat: types.has("chat"),
		liveWorkspace: types.has("live-workspace"),
		html: types.has("html"),
		agents: Array.isArray(agents) && agents.length > 0,
	};
}

function isInGroup(session: ActiveSession): boolean {
	const groupId = session.session_state?.chat_group_id;
	return typeof groupId === "string" ? groupId.length > 0 : groupId != null;
}

/**
 * True if the session is on a page with a matchmaking component and has not
 * been matched yet (matched participants stay on the page until they move on).
 * Uses the config the session is pinned to, or the live config without one.
 */
export function isWaitingInMatchmaking(
	session: ActiveSession,
	liveConfig: unknown,
): boolean {
	if (isInGroup(session)) return false;
	const config = session.config ?? liveConfig;
	return componentTypes(getPage(config, session.currentPageId)).includes(
		"matchmaking",
	);
}

function toIso(date: Date | null | undefined): string | null {
	return date instanceof Date ? date.toISOString() : null;
}

export function isLiveGroupStudy(entry: ConfigActivity): boolean {
	return entry.isGroupStudy && entry.activeNow.total > 0;
}

export function summarizeActivity(input: ActivityInput): ActivityReport {
	const configIds = new Set<string>(input.lastActivity.keys());
	for (const session of input.activeSessions) configIds.add(session.configId);

	const entries: ConfigActivity[] = [];
	for (const configId of configIds) {
		const doc = input.configs.get(configId) ?? null;
		const sessions = input.activeSessions.filter(
			(session) => session.configId === configId,
		);
		const inGroup = sessions.filter(isInGroup).length;
		const counts = input.counts.get(configId);
		const ownerId = doc?.owner ?? null;

		entries.push({
			configId,
			name: doc?.name ?? null,
			ownerId,
			ownerEmail: ownerId ? (input.ownerEmails.get(ownerId) ?? null) : null,
			revision: doc?.revision ?? null,
			updatedAt: toIso(doc?.updatedAt),
			lastActivityAt: toIso(input.lastActivity.get(configId)),
			activeNow: {
				total: sessions.length,
				inGroup,
				solo: sessions.length - inGroup,
			},
			waitingInMatchmaking: sessions.filter((session) =>
				isWaitingInMatchmaking(session, doc?.config),
			).length,
			startedToday: counts?.startedToday ?? 0,
			totalSessions: counts?.total ?? 0,
			prolificSessions: counts?.prolific ?? 0,
			isGroupStudy: doc ? isGroupStudy(doc.config) : false,
			features: configFeatures(doc?.config),
		});
	}

	// Live group studies first, then the busiest, then the most recent
	entries.sort(
		(a, b) =>
			Number(isLiveGroupStudy(b)) - Number(isLiveGroupStudy(a)) ||
			b.activeNow.total - a.activeNow.total ||
			(b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? ""),
	);

	return {
		generatedAt: input.now.toISOString(),
		since: input.since.toISOString(),
		activeWindowMinutes: ACTIVE_WINDOW_MS / 60_000,
		configs: entries,
		liveGroupStudies: entries.filter(isLiveGroupStudy),
	};
}
