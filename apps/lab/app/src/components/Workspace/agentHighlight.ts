/**
 * Highlight text an agent just inserted, fading after a few seconds, so
 * participants notice edits made outside their own typing.
 */

import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";
import type * as Y from "yjs";
import { isAgentOrigin } from "./useWorkspaceDoc";

const HIGHLIGHT_MS = 4_000;

const addHighlights = StateEffect.define<Array<{ from: number; to: number }>>();
const clearHighlights = StateEffect.define<null>();

const highlight = Decoration.mark({ class: "cm-agent-edit" });

const highlightField = StateField.define<DecorationSet>({
	create: () => Decoration.none,
	update(decorations, tr) {
		let next = decorations.map(tr.changes);
		for (const effect of tr.effects) {
			if (effect.is(addHighlights)) {
				next = next.update({
					add: effect.value
						.filter((r) => r.to > r.from && r.to <= tr.state.doc.length)
						.map((r) => highlight.range(r.from, r.to)),
					sort: true,
				});
			} else if (effect.is(clearHighlights)) {
				next = Decoration.none;
			}
		}
		return next;
	},
	provide: (field) => EditorView.decorations.from(field),
});

const theme = EditorView.theme({
	".cm-agent-edit": {
		backgroundColor: "rgba(59, 130, 246, 0.18)",
		borderRadius: "2px",
		animation: `cm-agent-fade ${HIGHLIGHT_MS}ms ease-out forwards`,
	},
	"@keyframes cm-agent-fade": {
		"0%": { backgroundColor: "rgba(59, 130, 246, 0.35)" },
		"100%": { backgroundColor: "rgba(59, 130, 246, 0)" },
	},
});

export const agentHighlight = [highlightField, theme];

/** Highlight agent insertions into `text` in `view`. Returns a stop function. */
export function watchAgentEdits(text: Y.Text, view: EditorView): () => void {
	let clearTimer: ReturnType<typeof setTimeout> | undefined;
	let stopped = false;
	const observer = (event: Y.YTextEvent, transaction: Y.Transaction) => {
		if (!isAgentOrigin(transaction.origin)) return;
		const ranges: Array<{ from: number; to: number }> = [];
		let index = 0;
		for (const op of event.delta) {
			if (op.retain) index += op.retain;
			else if (typeof op.insert === "string") {
				ranges.push({ from: index, to: index + op.insert.length });
				index += op.insert.length;
			}
		}
		if (ranges.length === 0) return;
		// After the editor has applied this same change from Yjs.
		setTimeout(() => {
			if (stopped) return;
			view.dispatch({ effects: addHighlights.of(ranges) });
			clearTimeout(clearTimer);
			clearTimer = setTimeout(() => {
				if (!stopped) view.dispatch({ effects: clearHighlights.of(null) });
			}, HIGHLIGHT_MS);
		});
	};
	text.observe(observer);
	return () => {
		stopped = true;
		text.unobserve(observer);
		clearTimeout(clearTimer);
	};
}
