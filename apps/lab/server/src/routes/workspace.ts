/**
 * Workspace routes for lab server
 * POST /workspace/:groupId/sync - Swap state vectors; returns what the client lacks
 * POST /workspace/:groupId/update - Apply a participant's Yjs update
 */

import { Elysia, t } from "elysia";
import * as Y from "yjs";
import { verifyMembership } from "../lib/groups";
import {
	applyClientUpdate,
	diffForClient,
	openWorkspaceForSession,
} from "../lib/workspace";

const toBase64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
const fromBase64 = (text: string) =>
	new Uint8Array(Buffer.from(text, "base64"));

export const workspaceRoutes = new Elysia({ prefix: "/workspace" })
	.post(
		"/:groupId/sync",
		async ({ params: { groupId }, body, set }) => {
			const { sessionId, pageId, stateVector } = body;

			if (!(await verifyMembership(sessionId, groupId))) {
				set.status = 403;
				return { error: "not_a_member" };
			}

			const workspace = await openWorkspaceForSession(
				sessionId,
				groupId,
				pageId,
			);
			if (!workspace) {
				set.status = 404;
				return { error: "no_workspace" };
			}

			const diff = diffForClient(
				workspace,
				stateVector ? fromBase64(stateVector) : undefined,
			);
			return {
				mode: workspace.settings.mode,
				update: toBase64(diff.update),
				stateVector: toBase64(diff.stateVector),
			};
		},
		{
			params: t.Object({ groupId: t.String() }),
			body: t.Object({
				sessionId: t.String({ minLength: 1 }),
				pageId: t.String({ minLength: 1 }),
				stateVector: t.Optional(t.String()),
			}),
		},
	)
	.post(
		"/:groupId/update",
		async ({ params: { groupId }, body, set }) => {
			const { sessionId, pageId, update } = body;

			if (!(await verifyMembership(sessionId, groupId))) {
				set.status = 403;
				return { error: "not_a_member" };
			}

			const workspace = await openWorkspaceForSession(
				sessionId,
				groupId,
				pageId,
			);
			if (!workspace) {
				set.status = 404;
				return { error: "no_workspace" };
			}
			if (workspace.settings.editableBy === "agent") {
				set.status = 403;
				return { error: "read_only" };
			}

			const bytes = fromBase64(update);
			try {
				Y.decodeUpdate(bytes);
			} catch {
				set.status = 400;
				return { error: "bad_update" };
			}

			try {
				await applyClientUpdate(workspace, bytes, sessionId);
			} catch (error) {
				// Not saved; the client keeps the update and sends it again.
				console.error("[Workspace] Failed to save update:", error);
				set.status = 500;
				return { error: "save_failed" };
			}

			return { ok: true };
		},
		{
			params: t.Object({ groupId: t.String() }),
			body: t.Object({
				sessionId: t.String({ minLength: 1 }),
				pageId: t.String({ minLength: 1 }),
				update: t.String({ minLength: 1 }),
			}),
		},
	);
