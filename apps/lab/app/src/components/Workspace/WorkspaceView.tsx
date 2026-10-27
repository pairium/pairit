/**
 * WorkspaceView - Presentational workspace component
 * Edits a Yjs doc directly: freeform is a CodeMirror markdown editor bound to
 * its text, structured is labelled fields bound to its fields map.
 */

import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { syntaxHighlighting } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { yCollab, yUndoManagerKeymap } from "y-codemirror.next";
import type * as Y from "yjs";
import { agentHighlight, watchAgentEdits } from "./agentHighlight";
import { documentStyle, livePreview } from "./livePreview";
import { WorkspaceRenderer } from "./WorkspaceRenderer";

export type FieldDefinition = {
	id: string;
	label: string;
	type?: "text" | "number" | "textarea";
};

export type WorkspaceViewProps = {
	mode: "freeform" | "structured";
	doc: Y.Doc;
	// The file's name; only .md files get markdown preview
	file?: string;
	// A researcher's renderer, bundled from the `renderer` prop
	renderer?: { html: string; height: number };
	// Where a renderer's edits go
	target: { groupId: string; sessionId: string; pageId: string };
	fieldDefinitions?: FieldDefinition[];
	disabled?: boolean;
};

export function WorkspaceView({
	mode,
	doc,
	file = "workspace.md",
	renderer,
	target,
	fieldDefinitions = [],
	disabled = false,
}: WorkspaceViewProps) {
	if (mode === "structured") {
		return (
			<StructuredEditor
				fields={doc.getMap("fields")}
				fieldDefinitions={fieldDefinitions}
				disabled={disabled}
			/>
		);
	}

	if (renderer) {
		return (
			<WorkspaceRenderer
				text={doc.getText("content")}
				html={renderer.html}
				height={renderer.height}
				readOnly={disabled}
				target={target}
			/>
		);
	}

	return (
		<FreeformEditor
			text={doc.getText("content")}
			disabled={disabled}
			preview={file.toLowerCase().endsWith(".md")}
		/>
	);
}

const editorTheme = EditorView.theme({
	"&": { height: "100%", fontSize: "0.875rem" },
	"&.cm-focused": { outline: "none" },
	".cm-scroller": { lineHeight: "1.625" },
	".cm-content": { padding: "0.75rem 1rem" },
});

const codeTheme = EditorView.theme({
	".cm-scroller": {
		fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
	},
});

function FreeformEditor({
	text,
	disabled,
	preview,
}: {
	text: Y.Text;
	disabled: boolean;
	// Markdown with live preview; otherwise a plain code editor
	preview: boolean;
}) {
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!containerRef.current) return;
		const view = new EditorView({
			parent: containerRef.current,
			state: EditorState.create({
				doc: text.toString(),
				extensions: [
					// Undo only reverts this participant's own edits.
					keymap.of([...yUndoManagerKeymap, ...defaultKeymap, indentWithTab]),
					preview
						? [markdown(), syntaxHighlighting(documentStyle), livePreview]
						: codeTheme,
					agentHighlight,
					EditorView.lineWrapping,
					placeholder("Start writing..."),
					EditorState.readOnly.of(disabled),
					EditorView.editable.of(!disabled),
					editorTheme,
					yCollab(text, null),
				],
			}),
		});
		const stopWatching = watchAgentEdits(text, view);
		return () => {
			stopWatching();
			view.destroy();
		};
	}, [text, disabled, preview]);

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div
				ref={containerRef}
				data-testid="workspace-editor"
				className={`min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200 transition-colors focus-within:border-slate-400 ${
					disabled ? "bg-slate-50 text-slate-500" : "bg-white"
				}`}
			/>
		</div>
	);
}

function useMapSnapshot(map: Y.Map<unknown>): Record<string, unknown> {
	const snapshot = useRef(map.toJSON());
	const subscribe = useCallback(
		(onChange: () => void) => {
			const observer = () => {
				snapshot.current = map.toJSON();
				onChange();
			};
			snapshot.current = map.toJSON();
			map.observe(observer);
			return () => map.unobserve(observer);
		},
		[map],
	);
	return useSyncExternalStore(subscribe, () => snapshot.current);
}

function StructuredEditor({
	fields,
	fieldDefinitions,
	disabled,
}: {
	fields: Y.Map<unknown>;
	fieldDefinitions: FieldDefinition[];
	disabled: boolean;
}) {
	const values = useMapSnapshot(fields);

	if (fieldDefinitions.length === 0) {
		return (
			<div className="text-center text-sm text-slate-500">
				No fields defined for this workspace.
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{fieldDefinitions.map((field) => {
				const value = values[field.id] ?? "";
				const fieldType = field.type ?? "text";
				const setValue = (next: string | number) => fields.set(field.id, next);

				return (
					<div key={field.id} className="space-y-1">
						<label
							htmlFor={`ws-field-${field.id}`}
							className="block text-sm font-medium text-slate-700"
						>
							{field.label}
						</label>
						{fieldType === "textarea" ? (
							<textarea
								id={`ws-field-${field.id}`}
								value={String(value)}
								onChange={(e) => setValue(e.target.value)}
								disabled={disabled}
								rows={4}
								className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm transition-colors focus:border-slate-400 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
							/>
						) : (
							<input
								id={`ws-field-${field.id}`}
								type={fieldType}
								value={
									fieldType === "number" ? (value as number) : String(value)
								}
								onChange={(e) =>
									setValue(
										fieldType === "number"
											? Number(e.target.value)
											: e.target.value,
									)
								}
								disabled={disabled}
								className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm transition-colors focus:border-slate-400 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
							/>
						)}
					</div>
				);
			})}
		</div>
	);
}
