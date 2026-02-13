/**
 * Participant icon utilities for chat
 * Provides deterministic icon assignment based on senderId
 */

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

// Icon pool for other participants (Nature category)
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

// Fixed icons
export const SELF_ICON = User;
export const AGENT_ICON = Bot;

/**
 * Simple hash function for strings
 * Returns a number that can be used as an index
 */
function hashString(str: string): number {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash = hash & hash; // Convert to 32-bit integer
	}
	return Math.abs(hash);
}

/**
 * Get a deterministic icon for a participant based on their senderId
 * Same senderId always returns the same icon
 */
export function getParticipantIcon(senderId: string): LucideIcon {
	const index = hashString(senderId) % PARTICIPANT_ICONS.length;
	return PARTICIPANT_ICONS[index];
}

/**
 * Get the appropriate icon for a chat message sender
 */
export function getChatIcon(
	senderId: string,
	senderType: "participant" | "agent" | "system",
	isOwn: boolean,
): LucideIcon | null {
	if (senderType === "system") {
		return null; // No icon for system messages
	}
	if (isOwn) {
		return SELF_ICON;
	}
	if (senderType === "agent") {
		return AGENT_ICON;
	}
	return getParticipantIcon(senderId);
}
