import { getScopePath, SCOPE_PATH, type Scope } from "@app/runtime/expression";

/**
 * Backslash-escapes every ASCII punctuation character, so a value renders as
 * the plain text it is: no links, images, HTML, emphasis or code fences.
 */
export function escapeMarkdown(value: string): string {
	return value.replace(/[!-/:-@[-`{-~]/g, "\\$&");
}

/**
 * Interpolate template variables like {{session_state.xxx}} or
 * {{group.ws.xxx}} with actual values. Values can come from other
 * participants, so they are escaped and never parsed as Markdown.
 */
export function interpolate(text: string, scope: Scope): string {
	return text.replace(
		new RegExp(`\\{\\{(${SCOPE_PATH})\\}\\}`, "g"),
		(raw, path) => {
			const value = getScopePath(scope, path);
			return value !== undefined ? escapeMarkdown(String(value)) : raw;
		},
	);
}
