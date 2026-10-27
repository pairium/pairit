/**
 * Keeps a local Y.Doc in sync with the lab server's copy of a workspace
 * Local changes are merged and sent every ~50 ms and kept until the server
 * has saved them. On load, on every SSE (re)connect, after the server comes
 * back, and every 15 s, client and server swap state vectors and send each
 * other what the other lacks.
 */

import {
	NotAMemberError,
	pushWorkspaceUpdate,
	syncWorkspace,
	WorkspaceRefusedError,
} from "@app/lib/api";
import { sseClient } from "@app/lib/sse";
import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";

const SEND_EVERY_MS = 50;
const MAX_RETRY_MS = 5_000;
// A safety net for a stream that died without the browser noticing.
const RESYNC_EVERY_MS = 15_000;
// Changes applied from the server are never sent back. Live updates carry
// who made them, so the editor can highlight an agent's edits.
const REMOTE = Symbol("remote");
type RemoteOrigin = { remote: true; author: string };

export function isAgentOrigin(origin: unknown): boolean {
	return (
		typeof origin === "object" &&
		origin !== null &&
		(origin as RemoteOrigin).remote === true &&
		(origin as RemoteOrigin).author.startsWith("agent:")
	);
}

function isRemote(origin: unknown): boolean {
	return (
		origin === REMOTE ||
		(typeof origin === "object" &&
			origin !== null &&
			(origin as RemoteOrigin).remote === true)
	);
}

export type WorkspaceDocState =
	| { status: "loading" }
	| { status: "ready"; mode: "freeform" | "structured" }
	| { status: "not_a_member" }
	| { status: "error" };

type SSEWorkspaceUpdate = {
	groupId: string;
	pageId: string;
	update: string;
	author: string;
};

export function useWorkspaceDoc(
	groupId: string,
	sessionId: string | null | undefined,
	pageId: string | undefined,
	onSaved?: (doc: Y.Doc) => void,
): { doc: Y.Doc; state: WorkspaceDocState } {
	const [doc, setDoc] = useState(() => new Y.Doc());
	const [state, setState] = useState<WorkspaceDocState>({ status: "loading" });
	const onSavedRef = useRef(onSaved);
	onSavedRef.current = onSaved;

	useEffect(() => {
		if (!groupId || !sessionId || !pageId) return;
		const ydoc = new Y.Doc();
		setDoc(ydoc);
		setState({ status: "loading" });

		let closed = false;
		let pending: Uint8Array[] = [];
		let timer: ReturnType<typeof setTimeout> | undefined;
		let sending = false;
		let retries = 0;

		const schedule = (delay = SEND_EVERY_MS) => {
			if (!timer && !closed) timer = setTimeout(send, delay);
		};

		const send = async () => {
			timer = undefined;
			if (sending || pending.length === 0) return;
			const batch = Y.mergeUpdates(pending);
			pending = [];
			sending = true;
			try {
				await pushWorkspaceUpdate(groupId, sessionId, pageId, toBase64(batch));
				// The server was unreachable; catch up on what we missed.
				if (retries > 0) void sync();
				retries = 0;
				onSavedRef.current?.(ydoc);
			} catch (error) {
				if (
					error instanceof WorkspaceRefusedError ||
					error instanceof NotAMemberError
				) {
					// Read-only, malformed or not a member: sending it again won't help.
					console.error("[Workspace] Update refused:", error.message);
				} else {
					pending.unshift(batch);
					retries++;
				}
			} finally {
				sending = false;
			}
			if (pending.length > 0) {
				schedule(
					retries ? Math.min(MAX_RETRY_MS, 250 * 2 ** retries) : SEND_EVERY_MS,
				);
			}
		};

		const onUpdate = (update: Uint8Array, origin: unknown) => {
			if (isRemote(origin)) return;
			pending.push(update);
			schedule();
		};

		const sync = async () => {
			try {
				const response = await syncWorkspace(
					groupId,
					sessionId,
					pageId,
					toBase64(Y.encodeStateVector(ydoc)),
				);
				if (closed) return;
				Y.applyUpdate(ydoc, fromBase64(response.update), REMOTE);
				// Send what the server lacks, e.g. edits made while offline.
				const missing = Y.encodeStateAsUpdate(
					ydoc,
					fromBase64(response.stateVector),
				);
				if (hasChanges(missing)) {
					pending.push(missing);
					schedule();
				}
				setState({ status: "ready", mode: response.mode });
			} catch (error) {
				if (closed) return;
				console.error("[Workspace] Sync failed:", error);
				setState((current) =>
					error instanceof NotAMemberError
						? { status: "not_a_member" }
						: current.status === "ready"
							? current
							: { status: "error" },
				);
			}
		};

		ydoc.on("update", onUpdate);
		const offUpdate = sseClient.on("workspace_update", (data) => {
			const event = data as SSEWorkspaceUpdate;
			if (event.groupId !== groupId || event.pageId !== pageId) return;
			const origin: RemoteOrigin = { remote: true, author: event.author };
			Y.applyUpdate(ydoc, fromBase64(event.update), origin);
		});
		// Catch up on anything missed while the stream was down.
		const offConnected = sseClient.on("connected", () => void sync());
		const resync = setInterval(() => void sync(), RESYNC_EVERY_MS);
		void sync();

		return () => {
			closed = true;
			clearTimeout(timer);
			clearInterval(resync);
			offUpdate();
			offConnected();
			ydoc.off("update", onUpdate);
			if (pending.length > 0) {
				const batch = toBase64(Y.mergeUpdates(pending));
				void pushWorkspaceUpdate(groupId, sessionId, pageId, batch, {
					keepalive: batch.length < 60_000,
				}).catch(() => {});
			}
			ydoc.destroy();
		};
	}, [groupId, sessionId, pageId]);

	return { doc, state };
}

// An update with no changes encodes as two zero bytes.
function hasChanges(update: Uint8Array): boolean {
	return update.length > 2;
}

function toBase64(bytes: Uint8Array): string {
	let binary = "";
	for (let i = 0; i < bytes.length; i += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
	const binary = atob(text);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}
