/**
 * Live preview for the markdown editor
 * The text stays markdown (agents edit it exactly); this only changes how it
 * looks. Headings, emphasis, links and code are styled, and their markdown
 * symbols are hidden except on the lines being edited. When the editor isn't
 * focused, every line reads as a rendered document.
 */

import { HighlightStyle, syntaxTree } from "@codemirror/language";
import { type EditorState, RangeSetBuilder } from "@codemirror/state";
import {
	Decoration,
	type DecorationSet,
	EditorView,
	ViewPlugin,
	type ViewUpdate,
	WidgetType,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";

export const documentStyle = HighlightStyle.define([
	{ tag: tags.heading1, fontSize: "1.6em", fontWeight: "700" },
	{ tag: tags.heading2, fontSize: "1.3em", fontWeight: "700" },
	{ tag: tags.heading3, fontSize: "1.1em", fontWeight: "700" },
	{ tag: [tags.heading4, tags.heading5, tags.heading6], fontWeight: "700" },
	{ tag: tags.strong, fontWeight: "700" },
	{ tag: tags.emphasis, fontStyle: "italic" },
	{ tag: tags.strikethrough, textDecoration: "line-through" },
	{ tag: tags.link, color: "#2563eb", textDecoration: "underline" },
	{ tag: tags.url, color: "#64748b" },
	{
		tag: tags.monospace,
		fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
		backgroundColor: "#f1f5f9",
		borderRadius: "3px",
	},
	{ tag: tags.quote, color: "#475569", fontStyle: "italic" },
	{ tag: tags.processingInstruction, color: "#94a3b8" },
]);

// Symbols that disappear on lines that aren't being edited
const HIDDEN = new Set([
	"HeaderMark",
	"EmphasisMark",
	"CodeMark",
	"LinkMark",
	"URL",
	"StrikethroughMark",
	"QuoteMark",
]);

class BulletWidget extends WidgetType {
	toDOM(): HTMLElement {
		const span = document.createElement("span");
		span.textContent = "•";
		span.className = "cm-preview-bullet";
		return span;
	}
	eq(): boolean {
		return true;
	}
}

const hide = Decoration.replace({});
const bullet = Decoration.replace({ widget: new BulletWidget() });

/** Line numbers holding a cursor or selection, if the editor has focus. */
function editingLines(view: EditorView): Set<number> {
	const lines = new Set<number>();
	if (!view.hasFocus) return lines;
	const { doc } = view.state;
	for (const range of view.state.selection.ranges) {
		const first = doc.lineAt(range.from).number;
		const last = doc.lineAt(range.to).number;
		for (let n = first; n <= last; n++) lines.add(n);
	}
	return lines;
}

function buildDecorations(view: EditorView): DecorationSet {
	const state: EditorState = view.state;
	const editing = editingLines(view);
	const builder = new RangeSetBuilder<Decoration>();
	for (const { from, to } of view.visibleRanges) {
		syntaxTree(state).iterate({
			from,
			to,
			enter: (node) => {
				if (editing.has(state.doc.lineAt(node.from).number)) return;
				if (node.name === "ListMark") {
					const mark = state.sliceDoc(node.from, node.to);
					// Only unordered bullets become dots; numbers stay.
					if (mark === "-" || mark === "*" || mark === "+") {
						builder.add(node.from, node.to, bullet);
					}
					return;
				}
				if (!HIDDEN.has(node.name) || node.from === node.to) return;
				// Hide a heading's "# " including the space after it.
				const end =
					node.name === "HeaderMark" &&
					state.sliceDoc(node.to, node.to + 1) === " "
						? node.to + 1
						: node.to;
				builder.add(node.from, end, hide);
			},
		});
	}
	return builder.finish();
}

export const livePreview = [
	ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;
			constructor(view: EditorView) {
				this.decorations = buildDecorations(view);
			}
			update(update: ViewUpdate) {
				if (
					update.docChanged ||
					update.viewportChanged ||
					update.selectionSet ||
					update.focusChanged
				) {
					this.decorations = buildDecorations(update.view);
				}
			}
		},
		{ decorations: (plugin) => plugin.decorations },
	),
	EditorView.theme({
		".cm-scroller": {
			fontFamily:
				"ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
		},
		".cm-preview-bullet": { color: "#64748b", paddingRight: "0.25em" },
	}),
];
