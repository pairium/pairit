/**
 * Workspace docs
 * One Y.Doc per workspace, held in memory. Every change is appended to
 * workspace_updates before it is broadcast, so the log alone can rebuild any
 * doc; snapshots only make loading faster.
 */

import { Binary } from "mongodb";
import * as Y from "yjs";
import { findPageInConfig, getSessionConfig } from "./agents";
import {
	getWorkspaceDocumentsCollection,
	getWorkspaceUpdatesCollection,
} from "./db";
import { getGroupMembers } from "./groups";
import { broadcastToSession } from "./sse";
import {
	applyEdit,
	getFields,
	getText,
	seedUpdate,
	type WorkspaceEdit,
	type WorkspaceField,
	type WorkspaceMode,
} from "./workspace-edit";

export type WorkspaceSettings = {
	mode: WorkspaceMode;
	editableBy: "participant" | "agent" | "both";
	scope: "participant" | "group";
	initialContent: string;
	fields: WorkspaceField[];
	// Agents that get file tools for this workspace
	agents: string[];
};

export type Workspace = {
	// Stored as `groupId` in workspace_documents and workspace_updates
	id: string;
	// Who can see it: the session-scoped or matched group
	groupId: string;
	pageId: string;
	configId: string;
	settings: WorkspaceSettings;
	doc: Y.Doc;
	lastUsed: number;
	lastEditor: string;
	// Saves run in the order changes were applied; this never rejects.
	saving: Promise<void>;
	// The newest save, which rejects if it failed.
	lastSave: Promise<void>;
	snapshotTimer?: ReturnType<typeof setTimeout>;
};

const SNAPSHOT_DELAY_MS = 2_000;
const IDLE_MS = 10 * 60_000;
// Updates logged this long before a snapshot are replayed on top of it too.
// Applying an update twice is harmless, and the overlap covers clock skew
// between two instances during a deploy.
const SNAPSHOT_OVERLAP_MS = 60_000;

const workspaces = new Map<string, Workspace>();
const opening = new Map<string, Promise<Workspace>>();

/** The live-workspace component on a page, with defaults filled in. */
export function getWorkspaceSettings(
	config: unknown,
	pageId: string,
): WorkspaceSettings | null {
	const page = findPageInConfig(config, pageId);
	const component = page?.components?.find((c) => c.type === "live-workspace");
	if (!component) return null;
	const props = component.props ?? {};
	return {
		mode: props.mode === "structured" ? "structured" : "freeform",
		editableBy:
			props.editableBy === "agent" || props.editableBy === "participant"
				? props.editableBy
				: "both",
		scope: props.scope === "group" ? "group" : "participant",
		initialContent:
			typeof props.initialContent === "string" ? props.initialContent : "",
		fields: Array.isArray(props.fields)
			? props.fields.filter(
					(f): f is WorkspaceField => typeof f?.id === "string",
				)
			: [],
		agents: Array.isArray(props.agents)
			? props.agents.filter((a): a is string => typeof a === "string")
			: [],
	};
}

/**
 * The doc a session sees on a page. Matches the lab app: a group workspace
 * uses the matched group, falling back to the participant's own doc.
 */
export function workspaceGroupId(
	settings: WorkspaceSettings,
	sessionId: string,
	pageId: string,
	sessionState: Record<string, unknown> | undefined,
): string {
	const chatGroupId = sessionState?.chat_group_id;
	return settings.scope === "group" && typeof chatGroupId === "string"
		? chatGroupId
		: `${sessionId}:${pageId}`;
}

/** Open the workspace a session sees on a page, or null if there is none. */
export async function openWorkspaceForSession(
	sessionId: string,
	groupId: string,
	pageId: string,
): Promise<Workspace | null> {
	const open = workspaces.get(workspaceId(groupId, pageId));
	if (open) {
		open.lastUsed = Date.now();
		return open;
	}
	const session = await getSessionConfig(sessionId);
	if (!session) return null;
	const settings = getWorkspaceSettings(session.config, pageId);
	if (!settings) return null;
	return openWorkspace(groupId, pageId, session.configId, settings);
}

/**
 * A workspace's own id. Session-scoped groups ("sessionId:pageId") already
 * name one page; a matched group spans pages, so its id adds the page.
 */
export function workspaceId(groupId: string, pageId: string): string {
	return groupId.includes(":") ? groupId : `${groupId}/${pageId}`;
}

export async function openWorkspace(
	groupId: string,
	pageId: string,
	configId: string,
	settings: WorkspaceSettings,
): Promise<Workspace> {
	const id = workspaceId(groupId, pageId);
	const open = workspaces.get(id);
	if (open) {
		open.lastUsed = Date.now();
		return open;
	}
	let pending = opening.get(id);
	if (!pending) {
		pending = loadWorkspace(id, groupId, pageId, configId, settings).finally(
			() => opening.delete(id),
		);
		opening.set(id, pending);
	}
	return pending;
}

async function loadWorkspace(
	id: string,
	groupId: string,
	pageId: string,
	configId: string,
	settings: WorkspaceSettings,
): Promise<Workspace> {
	const documents = await getWorkspaceDocumentsCollection();
	const updates = await getWorkspaceUpdatesCollection();
	const stored = await documents.findOne({ groupId: id });

	const doc = new Y.Doc();
	if (stored?.snapshot) Y.applyUpdate(doc, stored.snapshot.buffer);
	const since = stored?.snapshotAt
		? new Date(stored.snapshotAt.getTime() - SNAPSHOT_OVERLAP_MS)
		: undefined;
	const logged = await updates
		.find({ groupId: id, ...(since && { createdAt: { $gte: since } }) })
		.sort({ createdAt: 1 })
		.toArray();
	for (const entry of logged) Y.applyUpdate(doc, entry.update.buffer);

	const mode = stored?.mode ?? settings.mode;
	const workspace: Workspace = {
		id,
		groupId,
		pageId,
		configId: stored?.configId || configId,
		settings: { ...settings, mode },
		doc,
		lastUsed: Date.now(),
		lastEditor: stored?.updatedBy ?? "",
		saving: Promise.resolve(),
		lastSave: Promise.resolve(),
	};
	doc.on("update", (update: Uint8Array, origin: unknown) =>
		onUpdate(workspace, update, origin),
	);
	workspaces.set(id, workspace);

	if (!stored?.snapshot && logged.length === 0) {
		// A new doc gets the template. A doc saved before the log existed is
		// rebuilt from its plain copy.
		const update = stored
			? seedUpdate(mode, stored.content ?? "", stored.fields ?? {})
			: seedUpdate(mode, settings.initialContent);
		Y.applyUpdate(doc, update, stored ? "migration" : "seed");
		await workspace.saving;
	}
	return workspace;
}

function onUpdate(
	workspace: Workspace,
	update: Uint8Array,
	origin: unknown,
): void {
	const by = typeof origin === "string" ? origin : "unknown";
	workspace.lastUsed = Date.now();
	workspace.lastEditor = by;
	const save = workspace.saving.then(() =>
		saveAndBroadcast(workspace, update, by),
	);
	workspace.lastSave = save;
	workspace.saving = save.catch((error) => {
		console.error(
			`[Workspace] Failed to save update for ${workspace.id}:`,
			error,
		);
	});
	scheduleSnapshot(workspace);
}

async function saveAndBroadcast(
	workspace: Workspace,
	update: Uint8Array,
	origin: string,
): Promise<void> {
	const updates = await getWorkspaceUpdatesCollection();
	await updates.insertOne({
		groupId: workspace.id,
		configId: workspace.configId,
		origin,
		update: new Binary(update),
		createdAt: new Date(),
	});

	// Other participants see who edited only as "participant", never a
	// session id.
	const data = {
		groupId: workspace.groupId,
		pageId: workspace.pageId,
		update: Buffer.from(update).toString("base64"),
		author: origin.startsWith("agent:") ? origin : "participant",
	};
	for (const memberId of await getGroupMembers(workspace.groupId)) {
		broadcastToSession(memberId, "workspace_update", data);
	}
}

/** Apply a change and wait until it is saved and broadcast. */
async function applyAndSave(
	workspace: Workspace,
	change: () => void,
): Promise<void> {
	const before = workspace.lastSave;
	change();
	if (workspace.lastSave !== before) await workspace.lastSave;
}

/** A participant's Yjs update, from their editor. */
export async function applyClientUpdate(
	workspace: Workspace,
	update: Uint8Array,
	sessionId: string,
): Promise<void> {
	await applyAndSave(workspace, () =>
		Y.applyUpdate(workspace.doc, update, `session:${sessionId}`),
	);
}

/**
 * An edit that is checked first. Throws EditError if refused. `base` is the
 * doc as the editor read it (from readWorkspace); see applyEdit.
 */
export async function editWorkspace(
	workspace: Workspace,
	edit: WorkspaceEdit,
	origin: string,
	base?: Uint8Array,
): Promise<void> {
	await applyAndSave(workspace, () =>
		applyEdit(
			workspace.doc,
			workspace.settings.mode,
			workspace.settings.fields,
			edit,
			origin,
			base,
		),
	);
}

/** What a client with this state vector is missing, and what we have. */
export function diffForClient(
	workspace: Workspace,
	stateVector?: Uint8Array,
): { update: Uint8Array; stateVector: Uint8Array } {
	return {
		update: Y.encodeStateAsUpdate(workspace.doc, stateVector),
		stateVector: Y.encodeStateVector(workspace.doc),
	};
}

/**
 * The workspace as an agent reads it, and the doc state it read (to pass back
 * to editWorkspace as `base`).
 */
export function readWorkspace(workspace: Workspace): {
	text: string;
	base: Uint8Array;
} {
	const { doc } = workspace;
	return {
		text:
			workspace.settings.mode === "freeform"
				? getText(doc).toString()
				: JSON.stringify(getFields(doc).toJSON(), null, 2),
		base: Y.encodeStateAsUpdate(doc),
	};
}

function scheduleSnapshot(workspace: Workspace): void {
	clearTimeout(workspace.snapshotTimer);
	workspace.snapshotTimer = setTimeout(() => {
		workspace.snapshotTimer = undefined;
		saveSnapshot(workspace).catch((error) => {
			console.error(`[Workspace] Failed to snapshot ${workspace.id}:`, error);
		});
	}, SNAPSHOT_DELAY_MS);
}

/** Save the doc's state and a plain copy for the data export. */
async function saveSnapshot(workspace: Workspace): Promise<void> {
	const snapshotAt = new Date();
	const snapshot = Y.encodeStateAsUpdate(workspace.doc);
	const { mode } = workspace.settings;
	const editor = workspace.lastEditor;
	const documents = await getWorkspaceDocumentsCollection();
	await documents.updateOne(
		{ groupId: workspace.id },
		{
			$set: {
				mode,
				configId: workspace.configId,
				snapshot: new Binary(snapshot),
				snapshotAt,
				updatedBy: editor.startsWith("session:")
					? editor.slice("session:".length)
					: editor,
				updatedAt: new Date(),
				...(mode === "freeform"
					? { content: getText(workspace.doc).toString() }
					: { fields: getFields(workspace.doc).toJSON() }),
			},
			$setOnInsert: { groupId: workspace.id, createdAt: snapshotAt },
		},
		{ upsert: true },
	);
}

async function unload(workspace: Workspace): Promise<void> {
	workspaces.delete(workspace.id);
	clearTimeout(workspace.snapshotTimer);
	await workspace.saving;
	await saveSnapshot(workspace);
	workspace.doc.destroy();
}

setInterval(() => {
	const cutoff = Date.now() - IDLE_MS;
	for (const workspace of workspaces.values()) {
		if (workspace.lastUsed < cutoff) {
			unload(workspace).catch((error) => {
				console.error(`[Workspace] Failed to unload ${workspace.id}:`, error);
			});
		}
	}
}, 60_000).unref();
