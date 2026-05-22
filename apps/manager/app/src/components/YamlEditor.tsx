import { yaml } from "@codemirror/lang-yaml";
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { useEffect, useRef } from "react";

type Props = {
	value: string;
	onChange?: (next: string) => void;
	readOnly?: boolean;
	minHeight?: string;
	maxHeight?: string;
};

export function YamlEditor({
	value,
	onChange,
	readOnly = false,
	minHeight = "12rem",
	maxHeight = "32rem",
}: Props) {
	const hostRef = useRef<HTMLDivElement | null>(null);
	const viewRef = useRef<EditorView | null>(null);
	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;

	// Initialize once. Subsequent value changes (e.g. reset on cancel) replace the doc imperatively.
	// biome-ignore lint/correctness/useExhaustiveDependencies: readOnly + initial value drive setup
	useEffect(() => {
		if (!hostRef.current) return;
		const state = EditorState.create({
			doc: value,
			extensions: [
				basicSetup,
				lineNumbers(),
				yaml(),
				EditorView.editable.of(!readOnly),
				EditorState.readOnly.of(readOnly),
				EditorView.theme({
					"&": { fontSize: "13px" },
					".cm-scroller": {
						fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
						minHeight,
						maxHeight,
					},
				}),
				EditorView.updateListener.of((u) => {
					if (u.docChanged && onChangeRef.current) {
						onChangeRef.current(u.state.doc.toString());
					}
				}),
			],
		});
		const view = new EditorView({ state, parent: hostRef.current });
		viewRef.current = view;
		return () => {
			view.destroy();
			viewRef.current = null;
		};
	}, [readOnly]);

	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;
		const current = view.state.doc.toString();
		if (current !== value) {
			view.dispatch({
				changes: { from: 0, to: current.length, insert: value },
			});
		}
	}, [value]);

	return (
		<div
			ref={hostRef}
			className="rounded-2xl border border-slate-200 bg-white overflow-hidden"
		/>
	);
}
