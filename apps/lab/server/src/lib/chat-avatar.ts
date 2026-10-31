/**
 * Chat avatars
 * An avatar is a string: a Lucide icon name, or an image path/URL (contains "/"
 * or ":").
 */

import { interpolate } from "./prompt-resolver";

/** A config avatar as a trimmed string, or undefined if missing or empty. */
export function toAvatarString(value: unknown): string | undefined {
	return typeof value === "string" ? value.trim() || undefined : undefined;
}

type PageShape = {
	id: string;
	components?: Array<{ type: string; props?: { avatars?: unknown } }>;
};

/**
 * The avatar a participant's message carries: the chat component's
 * `avatars.participant` on the sender's current page, with
 * {{session_state.*}} filled from the sender's own state. Undefined when not
 * configured or when a referenced key is unset.
 */
export function resolveParticipantAvatar(
	config: unknown,
	pageId: string,
	sessionState: Record<string, unknown> | undefined,
): string | undefined {
	if (!config || typeof config !== "object") return undefined;
	const { pages, nodes } = config as {
		pages?: Record<string, PageShape>;
		nodes?: PageShape[];
	};
	const page =
		pages?.[pageId] ??
		(Array.isArray(nodes) ? nodes.find((n) => n.id === pageId) : undefined);
	const chat = page?.components?.find((c) => c.type === "chat");
	const avatars = chat?.props?.avatars as { participant?: unknown } | undefined;
	const template = toAvatarString(avatars?.participant);
	if (!template) return undefined;

	const resolved = interpolate(template, {
		session_state: sessionState,
	}).trim();
	if (!resolved || resolved.includes("{{")) return undefined;
	return resolved;
}
