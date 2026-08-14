import type { Ref } from "react";

export type HtmlEmbedProps = {
	srcdoc: string;
	height: number;
	title?: string;
	iframeRef?: Ref<HTMLIFrameElement>;
	onLoad?: () => void;
};

export function HtmlEmbed({
	srcdoc,
	height,
	title = "Custom experiment UI",
	iframeRef,
	onLoad,
}: HtmlEmbedProps) {
	return (
		<iframe
			ref={iframeRef}
			title={title}
			srcDoc={srcdoc}
			sandbox="allow-scripts"
			className="w-full rounded-lg border border-slate-200 bg-white"
			style={{ height }}
			onLoad={onLoad}
		/>
	);
}
