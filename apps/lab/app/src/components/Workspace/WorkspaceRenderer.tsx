/**
 * A researcher's own renderer for a workspace, in the same sandbox as the
 * html component. The lab page keeps the synced doc and posts its text to the
 * page on load and after every change; the page's replace(old, new) calls go
 * to the server as checked edits by this participant.
 */

import { replaceInWorkspace } from "@app/lib/api";
import { useEffect, useMemo, useRef } from "react";
import type * as Y from "yjs";
import {
	parseWorkspaceMessage,
	WORKSPACE_HELPER_SCRIPT,
	wrapHtmlSrcdoc,
} from "../Html/bridge";
import { HtmlEmbed } from "../Html/HtmlEmbed";

// Posts to the page at most this often while someone types.
const POST_EVERY_MS = 100;

export type WorkspaceRendererProps = {
	text: Y.Text;
	html: string;
	height: number;
	readOnly: boolean;
	target: { groupId: string; sessionId: string; pageId: string };
};

export function WorkspaceRenderer({
	text,
	html,
	height,
	readOnly,
	target,
}: WorkspaceRendererProps) {
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const srcdoc = useMemo(
		() => wrapHtmlSrcdoc(html, WORKSPACE_HELPER_SCRIPT),
		[html],
	);

	const post = () => {
		iframeRef.current?.contentWindow?.postMessage(
			{ type: "pairit:workspace", text: text.toString() },
			"*",
		);
	};

	// Send the text on every change, throttled.
	useEffect(() => {
		let timer: ReturnType<typeof setTimeout> | undefined;
		const observer = () => {
			if (timer) return;
			timer = setTimeout(() => {
				timer = undefined;
				post();
			}, POST_EVERY_MS);
		};
		text.observe(observer);
		return () => {
			text.unobserve(observer);
			clearTimeout(timer);
		};
	});

	// Relay the page's edits to the server and answer with the result.
	useEffect(() => {
		const onMessage = async (event: MessageEvent) => {
			const message = parseWorkspaceMessage(
				event,
				iframeRef.current?.contentWindow,
			);
			if (!message) return;
			const reply = (result: { ok: boolean; error?: string }) =>
				iframeRef.current?.contentWindow?.postMessage(
					{ type: "pairit:workspace:result", id: message.id, ...result },
					"*",
				);
			if (readOnly) {
				reply({ ok: false, error: "This workspace is read-only." });
				return;
			}
			try {
				reply(
					await replaceInWorkspace(
						target.groupId,
						target.sessionId,
						target.pageId,
						message.old,
						message.new,
					),
				);
			} catch (error) {
				reply({ ok: false, error: (error as Error).message });
			}
			// The page redraws from the latest text either way.
			post();
		};
		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	});

	return (
		<HtmlEmbed
			srcdoc={srcdoc}
			height={height}
			title="Workspace"
			iframeRef={iframeRef}
			onLoad={post}
		/>
	);
}
