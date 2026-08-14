import { useEffect, useId, useState } from "react";

let mermaidReady: Promise<typeof import("mermaid").default> | null = null;

function loadMermaid() {
	if (!mermaidReady) {
		mermaidReady = import("mermaid").then((mod) => {
			const mermaid = mod.default;
			mermaid.initialize({
				startOnLoad: false,
				securityLevel: "strict",
			});
			return mermaid;
		});
	}
	return mermaidReady;
}

export function MermaidBlock({ source }: { source: string }) {
	const rawId = useId().replace(/:/g, "");
	const [svg, setSvg] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		setSvg(null);
		setError(null);

		const renderId = `mermaid-${rawId}-${Math.random().toString(36).slice(2)}`;

		loadMermaid()
			.then((mermaid) => mermaid.render(renderId, source))
			.then(({ svg: rendered }) => {
				if (!cancelled) setSvg(rendered);
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

	if (!svg) {
		return null;
	}

	return (
		<div
			className="not-prose my-4 flex justify-center overflow-x-auto"
			// mermaid.render returns SVG; securityLevel "strict" disables click/script
			// biome-ignore lint/security/noDangerouslySetInnerHtml: mermaid SVG output
			dangerouslySetInnerHTML={{ __html: svg }}
		/>
	);
}
