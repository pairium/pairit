import { type CSSProperties, type Ref, useLayoutEffect, useRef } from "react";

export type HtmlEmbedProps = {
	srcdoc: string;
	height: number;
	borderless?: boolean;
	title?: string;
	iframeRef?: Ref<HTMLIFrameElement>;
	/** Runs once per srcdoc, when the researcher's document has loaded. */
	onLoad?: () => void;
	/**
	 * Runs when the frame loads anything after that: the document navigated
	 * itself away, so the lab must stop posting to it.
	 */
	onNavigateAway?: () => void;
};

export function HtmlEmbed({
	srcdoc,
	height,
	borderless = false,
	title = "Custom experiment UI",
	iframeRef,
	onLoad,
	onNavigateAway,
}: HtmlEmbedProps) {
	const loadsRef = useRef(0);
	// A new srcdoc reloads the frame with the researcher's document again
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset on srcdoc change
	useLayoutEffect(() => {
		loadsRef.current = 0;
	}, [srcdoc]);

	return (
		<iframe
			ref={iframeRef}
			title={title}
			srcDoc={srcdoc}
			sandbox="allow-scripts"
			className={
				borderless
					? "h-(--embed-height) w-full border-0 bg-white"
					: "h-(--embed-height) w-full rounded-lg border border-slate-200 bg-white"
			}
			style={{ "--embed-height": `${height}px` } as CSSProperties}
			onLoad={() => {
				loadsRef.current += 1;
				if (loadsRef.current === 1) onLoad?.();
				else onNavigateAway?.();
			}}
		/>
	);
}
