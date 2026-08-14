import { defineRuntimeComponent } from "@app/runtime/define-runtime-component";
import type { TextComponent } from "@app/runtime/types";
import { type ComponentProps, isValidElement, type ReactNode } from "react";
import Markdown from "react-markdown";
import { MermaidBlock } from "./MermaidBlock";

function isMermaidCode(className?: string) {
	return /(?:^|\s)language-mermaid(?:\s|$)/.test(className ?? "");
}

function MarkdownCode({
	className,
	children,
	...props
}: ComponentProps<"code">) {
	if (isMermaidCode(className)) {
		return <MermaidBlock source={String(children).replace(/\n$/, "")} />;
	}
	const isBlock = Boolean(className) || String(children).includes("\n");
	return (
		<code
			className={
				isBlock ? className : "rounded bg-slate-100 px-1 py-0.5 text-slate-800"
			}
			{...props}
		>
			{children}
		</code>
	);
}

function MarkdownPre({ children }: { children?: ReactNode }) {
	const nodes = Array.isArray(children) ? children : [children];
	const isMermaid = nodes.some(
		(node) =>
			(isValidElement<{ className?: string }>(node) &&
				isMermaidCode(node.props.className)) ||
			(isValidElement(node) && node.type === MermaidBlock),
	);
	if (isMermaid) {
		return <>{children}</>;
	}
	return (
		<pre className="not-prose my-4 overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800">
			{children}
		</pre>
	);
}

function getNestedValue(
	obj: Record<string, unknown> | undefined,
	path: string,
): unknown {
	if (!obj) return undefined;
	return path.split(".").reduce<unknown>((current, key) => {
		if (current == null || typeof current !== "object") return undefined;
		return (current as Record<string, unknown>)[key];
	}, obj);
}

/**
 * Interpolate template variables like {{session_state.xxx}} with actual values
 */
function interpolate(
	text: string,
	sessionState: Record<string, unknown> | undefined,
): string {
	return text.replace(/\{\{session_state\.([A-Za-z0-9_.]+)\}\}/g, (_, path) => {
		const value = getNestedValue(sessionState, path);
		return value !== undefined ? String(value) : `{{session_state.${path}}}`;
	});
}

export const TextRuntime = defineRuntimeComponent<
	"text",
	TextComponent["props"]
>({
	type: "text",
	renderer: ({ component, context }) => {
		const text = component.props.text;
		if (!text) {
			return null;
		}

		const interpolatedText = interpolate(text, context.sessionState);

		return (
			<div className="prose prose-slate max-w-none">
				<Markdown
					components={{
						code: MarkdownCode,
						pre: MarkdownPre,
					}}
				>
					{interpolatedText}
				</Markdown>
			</div>
		);
	},
});
