import { useEffect, useId, useState } from "react";
import { type MermaidFrame, toMermaidFrame } from "./mermaid-frame";

let mermaidReady: Promise<typeof import("mermaid").default> | null = null;

function loadMermaid() {
	if (!mermaidReady) {
		mermaidReady = import("mermaid").then((mod) => {
			const mermaid = mod.default;
			mermaid.initialize({
				startOnLoad: false,
				// Lays out the diagram in a sandboxed iframe, not in the lab page
				securityLevel: "sandbox",
				theme: "default",
				themeVariables: {
					darkMode: false,
					background: "transparent",
				},
			});
			return mermaid;
		});
	}
	return mermaidReady;
}

export function MermaidBlock({ source }: { source: string }) {
	const rawId = useId().replace(/:/g, "");
	const [frame, setFrame] = useState<MermaidFrame | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		setFrame(null);
		setError(null);

		const renderId = `mermaid-${rawId}-${Math.random().toString(36).slice(2)}`;

		loadMermaid()
			.then((mermaid) => mermaid.render(renderId, source))
			.then(({ svg: rendered }) => {
				if (cancelled) return;
				const next = toMermaidFrame(rendered);
				if (next) setFrame(next);
				else setError("Invalid diagram");
			})
			.catch((err: unknown) => {
				if (!cancelled) {
					setError(err instanceof Error ? err.message : "Invalid diagram");
				}
			});

		return () => {
			cancelled = true;
		};
	}, [source, rawId]);

	if (error) {
		return (
			<div className="not-prose my-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
				<p>Could not render diagram.</p>
				<pre className="mt-2 overflow-x-auto whitespace-pre-wrap">{source}</pre>
			</div>
		);
	}

	if (!frame) {
		return null;
	}

	// No sandbox permissions: the diagram can't run scripts, open links or
	// load anything (see DIAGRAM_CSP).
	return (
		<div className="not-prose my-4 flex justify-center overflow-x-auto">
			<iframe
				title="Diagram"
				sandbox=""
				srcDoc={frame.srcdoc}
				className="w-full border-0"
				style={{ height: frame.height }}
			/>
		</div>
	);
}
