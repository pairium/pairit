/**
 * Workspace Runtime - Connects WorkspaceView to the runtime system
 * Resolves the workspace's group, syncs its Yjs doc, and emits onEdit
 */

import { getSession, submitEvent } from "@app/lib/api";
import { defineRuntimeComponent } from "@app/runtime/define-runtime-component";
import {
	lazy,
	Suspense,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import type * as Y from "yjs";
import { useWorkspaceDoc } from "./useWorkspaceDoc";
import type { FieldDefinition } from "./WorkspaceView";

// The editor (CodeMirror) loads only on pages that have a workspace.
const WorkspaceView = lazy(() =>
	import("./WorkspaceView").then((m) => ({ default: m.WorkspaceView })),
);

function WorkspaceLoading() {
	return (
		<div className="flex h-64 items-center justify-center rounded-3xl border border-slate-200 bg-white">
			<div className="text-sm text-slate-400">Loading workspace...</div>
		</div>
	);
}

type WorkspaceProps = {
	mode?: "freeform" | "structured";
	file?: string;
	// Bundled at upload from the `renderer` file
	rendererHtml?: string;
	height?: number;
	editableBy?: "participant" | "agent" | "both";
	initialContent?: string;
	scope?: "participant" | "group";
	fields?: FieldDefinition[];
	agents?: string[];
};

export const WorkspaceRuntime = defineRuntimeComponent<
	"live-workspace",
	WorkspaceProps
>({
	type: "live-workspace",
	renderer: ({ component, context }) => {
		const { sessionId, sessionState, onSessionStateChange, pageId } = context;
		const mode = component.props.mode ?? "freeform";
		const editableBy = component.props.editableBy ?? "both";
		const scope = component.props.scope ?? "participant";

		// Resolve groupId
		const [resolvedGroupId, setResolvedGroupId] = useState<string | null>(
			() => {
				if (scope === "group" && sessionState?.chat_group_id) {
					return sessionState.chat_group_id as string;
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

		// Async resolution for group scope when sessionState not yet available
		useEffect(() => {
			if (resolvedGroupId || !sessionId || scope !== "group") return;

			let canceled = false;

			async function resolve() {
				try {
					const session = await getSession(sessionId as string);
					if (canceled) return;

					const serverGroupId = session.session_state?.chat_group_id as
						| string
						| undefined;
					if (serverGroupId) {
						setResolvedGroupId(serverGroupId);
						onSessionStateChange?.({ chat_group_id: serverGroupId });
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
		}, [resolvedGroupId, sessionId, pageId, scope, onSessionStateChange]);

		const groupId = resolvedGroupId ?? "";

		// Emit onEdit at most every 300 ms, after the server has the edit
		const onEditTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
			undefined,
		);
		useEffect(() => () => clearTimeout(onEditTimer.current), []);
		const handleSaved = useCallback(
			(doc: Y.Doc) => {
				const onEdit = component.events?.onEdit;
				if (!onEdit || !sessionId) return;
				clearTimeout(onEditTimer.current);
				onEditTimer.current = setTimeout(() => {
					void submitEvent(sessionId, {
						type: onEdit.type ?? "workspace_edit",
						timestamp: new Date().toISOString(),
						componentType: "live-workspace",
						componentId: component.id ?? "unknown",
						data: {
							...onEdit.data,
							groupId,
							...(mode === "freeform"
								? { content: doc.getText("content").toString() }
								: { fields: doc.getMap("fields").toJSON() }),
						},
					});
				}, 300);
			},
			[sessionId, groupId, mode, component.events, component.id],
		);

		const { doc, state } = useWorkspaceDoc(
			groupId,
			sessionId,
			pageId,
			handleSaved,
		);

		// A 403 can mean the group changed after matchmaking; re-resolve it.
		useEffect(() => {
			if (state.status !== "not_a_member" || !sessionId) return;
			let canceled = false;
			getSession(sessionId)
				.then((session) => {
					if (canceled) return;
					const serverGroupId = session.session_state?.chat_group_id as
						| string
						| undefined;
					if (serverGroupId && serverGroupId !== groupId) {
						setResolvedGroupId(serverGroupId);
						onSessionStateChange?.({ chat_group_id: serverGroupId });
					}
				})
				.catch((error) => {
					console.error(
						"[Workspace] Failed to re-fetch session after 403:",
						error,
					);
				});
			return () => {
				canceled = true;
			};
		}, [state.status, sessionId, groupId, onSessionStateChange]);

		if (!sessionId) {
			return (
				<div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
					Workspace requires an active session.
				</div>
			);
		}

		if (state.status === "error") {
			return (
				<div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
					The workspace could not be loaded. Reload the page to try again.
				</div>
			);
		}

		if (state.status !== "ready") return <WorkspaceLoading />;

		return (
			<Suspense fallback={<WorkspaceLoading />}>
				<WorkspaceView
					mode={state.mode}
					doc={doc}
					file={component.props.file}
					renderer={
						component.props.rendererHtml
							? {
									html: component.props.rendererHtml,
									height: component.props.height ?? 480,
								}
							: undefined
					}
					target={{ groupId, sessionId, pageId: pageId ?? "" }}
					fieldDefinitions={component.props.fields}
					disabled={editableBy === "agent"}
				/>
			</Suspense>
		);
	},
});
