import type { LucideIcon } from "lucide-react";
import * as LucideIcons from "lucide-react";
import {
	Bot,
	Cloud,
	Clover,
	Flower,
	Leaf,
	Moon,
	Mountain,
	Sprout,
	Sun,
	TreePine,
	User,
} from "lucide-react";

/**
 * A Lucide icon name, or an image path/URL (contains "/" or ":"). A
 * participant avatar filled from session_state may only be an icon or an
 * image on the lab's own origin.
 */
export type ChatAvatarConfig = string;

export type ChatAvatarOverrides = {
	self?: ChatAvatarConfig;
	participant?: ChatAvatarConfig;
	agent?: ChatAvatarConfig;
	agents?: Record<string, ChatAvatarConfig>;
};

export type ResolvedChatAvatar =
	| { type: "icon"; icon: LucideIcon }
	| { type: "image"; src: string }
	| null;

const PARTICIPANT_ICONS: LucideIcon[] = [
	Flower,
	Leaf,
	TreePine,
	Clover,
	Sprout,
	Mountain,
	Cloud,
	Sun,
	Moon,
];

const DEFAULT_SELF_ICON = User;
const DEFAULT_AGENT_ICON = Bot;

function hashString(str: string): number {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash = hash & hash;
	}
	return Math.abs(hash);
}

function toPascalCase(value: string): string {
	return value
		.split(/[^a-zA-Z0-9]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join("");
}

function getLucideIconByName(name?: string): LucideIcon | null {
	if (!name) return null;

	const normalized = toPascalCase(name);
	const icon = (LucideIcons as Record<string, unknown>)[normalized];
	return icon ? (icon as LucideIcon) : null;
}

function getParticipantIcon(senderId: string): LucideIcon {
	const index = hashString(senderId) % PARTICIPANT_ICONS.length;
	return PARTICIPANT_ICONS[index];
}

/** A relative path or a URL on the lab's own origin. */
export function isSameOriginImage(value: string): boolean {
	if (value.includes("\\")) return false;
	const origin = globalThis.location?.origin ?? "https://lab.invalid";
	try {
		return new URL(value, `${origin}/`).origin === origin;
	} catch {
		return false;
	}
}

/**
 * Whether a participant's message avatar may be shown. It can be filled from
 * their own session_state, so an image must be on the lab's origin, or on the
 * origin the config's template fixes before its first {{ (e.g.
 * "https://cdn.example.com/{{session_state.role}}.png"), or be the config's
 * literal avatar.
 */
export function isAllowedParticipantImage(
	value: string,
	template: string | undefined,
): boolean {
	if (isSameOriginImage(value)) return true;
	const configured = template?.trim();
	if (!configured) return false;
	if (!configured.includes("{{")) return value === configured;
	const prefix = configured.slice(0, configured.indexOf("{{"));
	if (!/^https?:\/\/[^/{}@\\]+\//i.test(prefix)) return false;
	try {
		return new URL(value).origin === new URL(prefix).origin;
	} catch {
		return false;
	}
}

function resolveAvatarConfig(
	config?: ChatAvatarConfig,
	isAllowedImage: (src: string) => boolean = () => true,
): ResolvedChatAvatar {
	const value = typeof config === "string" ? config.trim() : undefined;
	// Unresolved {{session_state.*}} templates are filled in by the server
	if (!value || value.includes("{{")) return null;

	if (value.includes("/") || value.includes(":")) {
		if (!isAllowedImage(value)) return null;
		return { type: "image", src: value };
	}

	const icon = getLucideIconByName(value);
	return icon ? { type: "icon", icon } : null;
}

/**
 * Order: the viewer's `self` override (own messages only), then the avatar
 * stamped on the message, then the config overrides, then defaults. A
 * specific `agents.{id}` override still beats the agent's own avatar.
 */
export function resolveChatAvatar(params: {
	senderId: string;
	senderType: "participant" | "agent" | "system";
	isOwn: boolean;
	avatar?: ChatAvatarConfig;
	avatars?: ChatAvatarOverrides;
}): ResolvedChatAvatar {
	const { senderId, senderType, isOwn, avatar, avatars } = params;

	if (senderType === "system") {
		return null;
	}

	// Config and agent avatars are written by the researcher and can be any
	// URL; a participant's message avatar is checked (see above).
	const participantAvatar = resolveAvatarConfig(avatar, (src) =>
		isAllowedParticipantImage(src, avatars?.participant),
	);

	if (isOwn) {
		return (
			resolveAvatarConfig(avatars?.self) ??
			participantAvatar ??
			({ type: "icon", icon: DEFAULT_SELF_ICON } as const)
		);
	}

	if (senderType === "agent") {
		const agentId = senderId.startsWith("agent:")
			? senderId.slice("agent:".length)
			: senderId;
		return (
			resolveAvatarConfig(avatars?.agents?.[agentId]) ??
			resolveAvatarConfig(avatar) ??
			resolveAvatarConfig(avatars?.agent) ??
			({ type: "icon", icon: DEFAULT_AGENT_ICON } as const)
		);
	}

	return (
		participantAvatar ??
		resolveAvatarConfig(avatars?.participant) ??
		({ type: "icon", icon: getParticipantIcon(senderId) } as const)
	);
}
