import { defineRuntimeComponent } from "@app/runtime/define-runtime-component";
import type { TextComponent } from "@app/runtime/types";
import Markdown from "react-markdown";

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
				<Markdown>{interpolatedText}</Markdown>
			</div>
		);
	},
});
