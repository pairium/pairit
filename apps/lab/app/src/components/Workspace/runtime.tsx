/**
 * Workspace Runtime - Connects WorkspaceView to the runtime system
 * Handles SSE subscription, workspace loading, and event emission
 */

import {
	getSession,
	getWorkspace,
	NotAMemberError,
	submitEvent,
	updateWorkspace,
} from "@app/lib/api";
import { sseClient } from "@app/lib/sse";
import { defineRuntimeComponent } from "@app/runtime/define-runtime-component";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FieldDefinition } from "./WorkspaceView";
import { WorkspaceView } from "./WorkspaceView";

type WorkspaceProps = {
	mode?: "freeform" | "structured";
	editableBy?: "participant" | "agent" | "both";
	initialContent?: string;
	scope?: "participant" | "group";
	fields?: FieldDefinition[];
	agents?: string[];
};

type SSEWorkspaceUpdated = {
	groupId: string;
	content?: string;
	fields?: Record<string, unknown>;
	updatedBy: string;
	updatedAt: string;
};

export const WorkspaceRuntime = defineRuntimeComponent<
	"live-workspace",
	WorkspaceProps
>({
	type: "live-workspace",
	renderer: ({ component, context }) => {
		const { sessionId, userState, onUserStateChange, pageId } = context;
		const mode = component.props.mode ?? "freeform";
		const editableBy = component.props.editableBy ?? "both";
		const scope = component.props.scope ?? "participant";

		const [content, setContent] = useState(
			component.props.initialContent ?? "",
		);
		const [fields, setFields] = useState<Record<string, unknown>>({});
		const [loading, setLoading] = useState(true);

		// Resolve groupId
		const [resolvedGroupId, setResolvedGroupId] = useState<string | null>(
			() => {
				if (scope === "group" && userState?.chat_group_id) {
					return userState.chat_group_id as string;
				}
				if (scope === "participant" && sessionId) {
					return `${sessionId}:${pageId}`;
				}
				return null;
			},
		);

		// Sync resolution when sessionId becomes available after initial render
		useEffect(() => {
			if (resolvedGroupId || !sessionId) return;
			if (scope === "participant") {
				setResolvedGroupId(`${sessionId}:${pageId}`);
			}
		}, [resolvedGroupId, sessionId, pageId, scope]);

		// Async resolution for group scope when userState not yet available
		useEffect(() => {
			if (resolvedGroupId || !sessionId || scope !== "group") return;

			let canceled = false;

			async function resolve() {
				try {
					const session = await getSession(sessionId as string);
					if (canceled) return;

					const serverGroupId = session.user_state?.chat_group_id as
						| string
						| undefined;
					if (serverGroupId) {
						setResolvedGroupId(serverGroupId);
						onUserStateChange?.({ chat_group_id: serverGroupId });
					} else {
						// Fallback to participant scope
						setResolvedGroupId(`${sessionId}:${pageId}`);
					}
				} catch (error) {
					if (canceled) return;
					console.error(
						"[Workspace] Failed to fetch session for groupId:",
						error,
					);
					setResolvedGroupId(`${sessionId}:${pageId}`);
				}
			}

			resolve();
			return () => {
				canceled = true;
			};
		}, [resolvedGroupId, sessionId, pageId, scope, onUserStateChange]);

		const groupId = resolvedGroupId ?? "";

		// Load workspace on mount
		useEffect(() => {
			if (!sessionId || !groupId) return;

			let canceled = false;

			async function loadWorkspace() {
				try {
					const { document } = await getWorkspace(groupId, sessionId as string);
					if (canceled) return;

					if (document) {
						if (document.content !== undefined) {
							setContent(document.content);
						}
						if (document.fields) {
							setFields(document.fields);
						}
					}
				} catch (error) {
					if (canceled) return;

					if (error instanceof NotAMemberError) {
						try {
							const session = await getSession(sessionId as string);
							if (canceled) return;
							const serverGroupId = session.user_state?.chat_group_id as
								| string
								| undefined;
							if (serverGroupId && serverGroupId !== groupId) {
								setResolvedGroupId(serverGroupId);
								onUserStateChange?.({ chat_group_id: serverGroupId });
								return;
							}
						} catch (fetchError) {
							console.error(
								"[Workspace] Failed to re-fetch session after 403:",
								fetchError,
							);
						}
					}
					console.error("[Workspace] Failed to load workspace:", error);
				} finally {
					if (!canceled) setLoading(false);
				}
			}

			loadWorkspace();
			return () => {
				canceled = true;
			};
		}, [sessionId, groupId, onUserStateChange]);

		// Subscribe to SSE workspace_updated events
		const lastUpdateRef = useRef<string>("");

		useEffect(() => {
			if (!sessionId || !groupId) return;

			const unsubscribe = sseClient.on("workspace_updated", (data) => {
				const event = data as SSEWorkspaceUpdated;
				if (event.groupId !== groupId) return;

				// Ignore own edits
				if (event.updatedBy === sessionId) return;

				if (event.content !== undefined) {
					setContent(event.content);
				}
				if (event.fields !== undefined) {
					setFields(event.fields);
				}
			});

			return unsubscribe;
		}, [sessionId, groupId]);

		// Handle workspace changes
		const handleChange = useCallback(
			(update: { content?: string; fields?: Record<string, unknown> }) => {
				if (!sessionId || !groupId) return;

				if (update.content !== undefined) {
					setContent(update.content);
				}
				if (update.fields !== undefined) {
					setFields(update.fields);
				}

				// Prevent duplicate server calls with same content
				const updateKey = JSON.stringify(update);
				if (updateKey === lastUpdateRef.current) return;
				lastUpdateRef.current = updateKey;

				updateWorkspace(groupId, sessionId, { ...update, mode }).catch(
					(error) => {
						console.error("[Workspace] Failed to save:", error);
					},
				);

				// Emit onEdit event if configured
				if (component.events?.onEdit) {
					void submitEvent(sessionId, {
						type: component.events.onEdit.type ?? "workspace_edit",
						timestamp: new Date().toISOString(),
						componentType: "live-workspace",
						componentId: component.id ?? "unknown",
						data: {
							...component.events.onEdit.data,
							groupId,
							...update,
						},
					});
				}
			},
			[sessionId, groupId, mode, component.events, component.id],
		);

		if (!sessionId) {
			return (
				<div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
					Workspace requires an active session.
				</div>
			);
		}

		if (!resolvedGroupId || loading) {
			return (
				<div className="flex h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white">
					<div className="text-sm text-slate-400">Loading workspace...</div>
				</div>
			);
		}

		const disabled = editableBy === "agent";

		return (
			<WorkspaceView
				mode={mode}
				content={content}
				fields={fields}
				fieldDefinitions={component.props.fields}
				disabled={disabled}
				onChange={handleChange}
			/>
		);
	},
});
