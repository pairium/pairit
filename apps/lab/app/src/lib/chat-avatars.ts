import * as LucideIcons from "lucide-react";
import type { LucideIcon } from "lucide-react";
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

export type ChatAvatarConfig = {
	icon?: string;
	image?: string;
};

export type ChatAvatarOverrides = {
	self?: ChatAvatarConfig;
	participant?: ChatAvatarConfig & { style?: "deterministic" };
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

function resolveAvatarConfig(config?: ChatAvatarConfig): ResolvedChatAvatar {
	if (config?.image) {
		return { type: "image", src: config.image };
	}

	const icon = getLucideIconByName(config?.icon);
	if (icon) {
		return { type: "icon", icon };
	}

	return null;
}

export function resolveChatAvatar(params: {
	senderId: string;
	senderType: "participant" | "agent" | "system";
	isOwn: boolean;
	avatars?: ChatAvatarOverrides;
}): ResolvedChatAvatar {
	const { senderId, senderType, isOwn, avatars } = params;

	if (senderType === "system") {
		return null;
	}

	if (isOwn) {
		return (
			resolveAvatarConfig(avatars?.self) ??
			({ type: "icon", icon: DEFAULT_SELF_ICON } as const)
		);
	}

	if (senderType === "agent") {
		const agentId = senderId.startsWith("agent:")
			? senderId.slice("agent:".length)
			: senderId;
		return (
			resolveAvatarConfig(avatars?.agents?.[agentId]) ??
			resolveAvatarConfig(avatars?.agent) ??
			({ type: "icon", icon: DEFAULT_AGENT_ICON } as const)
		);
	}

	return (
		resolveAvatarConfig(avatars?.participant) ??
		({ type: "icon", icon: getParticipantIcon(senderId) } as const)
	);
}
