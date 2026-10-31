/**
 * The `group` view
 * What a session may read about its matched group: the fields of its group
 * workspaces (`group.ws`) and the other members' values for the keys their
 * matchmaking pool lists in `share` (`group.others`, in join order). It is
 * built from data that is already stored, so nothing is copied.
 */

import { getGroupsCollection, getSessionsCollection } from "./db";
import { broadcastToSession } from "./sse";
import { readGroupWorkspaceFields } from "./workspace";

export type GroupView = {
	ws: Record<string, unknown>;
	others: Record<string, unknown>[];
};

type PoolShape = { id?: unknown; share?: unknown };
type PageShape = {
	id?: string;
	components?: Array<{ type?: string; props?: Record<string, unknown> }>;
};

const PUSH_DELAY_MS = 250;

/** The keys a pool shares with the rest of its group. */
export function sharedKeys(config: unknown, poolId: string): string[] {
	const pools = (config as { matchmaking?: unknown } | null)?.matchmaking;
	if (!Array.isArray(pools)) return [];
	const pool = (pools as PoolShape[]).find((p) => p?.id === poolId);
	return Array.isArray(pool?.share)
		? pool.share.filter((key): key is string => typeof key === "string")
		: [];
}

/** Pages with a structured group workspace, whose fields go in `group.ws`. */
export function groupWorkspacePages(config: unknown): string[] {
	const pages = (config as { pages?: unknown } | null)?.pages;
	if (!pages || typeof pages !== "object") return [];
	const list = Array.isArray(pages)
		? (pages as PageShape[])
		: Object.entries(pages as Record<string, PageShape>).map(([id, page]) => ({
				...page,
				id: page.id ?? id,
			}));
	return list
		.filter((page) =>
			page.components?.some(
				(c) =>
					c.type === "live-workspace" &&
					c.props?.scope === "group" &&
					c.props?.mode === "structured",
			),
		)
		.flatMap((page) => (page.id ? [page.id] : []));
}

export function buildGroupView(
	sessionId: string,
	members: Array<{ id: string; session_state?: Record<string, unknown> }>,
	share: string[],
	ws: Record<string, unknown>,
): GroupView {
	const others = members
		.filter((member) => member.id !== sessionId)
		.map((member) => {
			const values: Record<string, unknown> = {};
			for (const key of share) {
				const value = member.session_state?.[key];
				if (value !== undefined) values[key] = value;
			}
			return values;
		});
	return { ws, others };
}

const EMPTY_VIEW: GroupView = { ws: {}, others: [] };

/** Each member's view of a matched group, keyed by session id. */
async function viewsForGroup(groupId: string): Promise<Map<string, GroupView>> {
	const views = new Map<string, GroupView>();
	const group = await (await getGroupsCollection()).findOne({ groupId });
	if (!group) return views;

	const members = await (await getSessionsCollection())
		.find({ id: { $in: group.memberSessionIds } })
		.project<{
			id: string;
			config: unknown;
			session_state?: Record<string, unknown>;
		}>({ id: 1, config: 1, session_state: 1 })
		.toArray();
	const byId = new Map(members.map((m) => [m.id, m]));
	const ordered = group.memberSessionIds.flatMap((id) => {
		const member = byId.get(id);
		return member ? [member] : [];
	});
	const config = ordered[0]?.config;
	if (!config) return views;

	const share = sharedKeys(config, group.poolId);
	const ws: Record<string, unknown> = {};
	for (const pageId of groupWorkspacePages(config)) {
		Object.assign(ws, await readGroupWorkspaceFields(groupId, pageId));
	}
	for (const member of ordered) {
		views.set(member.id, buildGroupView(member.id, ordered, share, ws));
	}
	return views;
}

/** A session's current view; empty when it is not in a matched group. */
export async function getGroupView(sessionId: string): Promise<GroupView> {
	const groupId = await groupIdOf(sessionId);
	if (!groupId) return EMPTY_VIEW;
	return (await viewsForGroup(groupId)).get(sessionId) ?? EMPTY_VIEW;
}

async function groupIdOf(sessionId: string): Promise<string | null> {
	const session = await (await getSessionsCollection()).findOne(
		{ id: sessionId },
		{ projection: { "session_state.group_id": 1 } },
	);
	const groupId = session?.session_state?.group_id;
	return typeof groupId === "string" ? groupId : null;
}

const pending = new Map<string, ReturnType<typeof setTimeout>>();

/** Send a session its view, e.g. when its event stream connects. */
export async function sendGroupView(sessionId: string): Promise<void> {
	broadcastToSession(sessionId, "group_updated", {
		group: await getGroupView(sessionId),
	});
}

/**
 * Push fresh views to a group's members. Calls within a short window are
 * batched, so typing in a workspace sends a few updates, not one per key.
 */
export function scheduleGroupPush(groupId: string): void {
	if (pending.has(groupId)) return;
	pending.set(
		groupId,
		setTimeout(() => {
			pending.delete(groupId);
			pushGroupViews(groupId).catch((error) => {
				console.error(`[Group] Failed to push views for ${groupId}:`, error);
			});
		}, PUSH_DELAY_MS),
	);
}

async function pushGroupViews(groupId: string): Promise<void> {
	for (const [sessionId, view] of await viewsForGroup(groupId)) {
		broadcastToSession(sessionId, "group_updated", { group: view });
	}
}

/** Call after writing a session's state, so its group sees shared keys. */
export async function sessionStateChanged(
	sessionId: string,
	paths: string[],
): Promise<void> {
	const session = await (await getSessionsCollection()).findOne(
		{ id: sessionId },
		{ projection: { config: 1, "session_state.group_id": 1 } },
	);
	const groupId = session?.session_state?.group_id;
	if (typeof groupId !== "string") return;
	const group = await (await getGroupsCollection()).findOne(
		{ groupId },
		{ projection: { poolId: 1 } },
	);
	if (!group) return;
	const share = sharedKeys(session?.config, group.poolId);
	if (paths.some((path) => share.includes(path.split(".")[0]))) {
		scheduleGroupPush(groupId);
	}
}
