import { defineRuntimeComponent } from "@app/runtime/define-runtime-component";
import type { TextComponent } from "@app/runtime/types";
import Markdown from "react-markdown";

/**
 * Interpolate template variables like {{user_state.xxx}} with actual values
 */
function interpolate(
	text: string,
	userState: Record<string, unknown> | undefined,
): string {
	return text.replace(/\{\{user_state\.(\w+)\}\}/g, (_, key) => {
		const value = userState?.[key];
		return value !== undefined ? String(value) : `{{user_state.${key}}}`;
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

		const interpolatedText = interpolate(text, context.userState);

		return (
			<div className="prose prose-slate max-w-none">
				<Markdown>{interpolatedText}</Markdown>
			</div>
		);
	},
});
