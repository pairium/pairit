/**
 * Pseudonymous member IDs. Peers in a group see each other as `p_…` IDs that
 * are stable within the group and unlinkable across groups. Real sessionIds
 * stay in the database (exports join on them) and never reach other
 * participants, since a sessionId is what lets a request act on a session.
 */

import { createHmac } from "node:crypto";

let cachedKey: Buffer | null = null;

function memberIdKey(): Buffer {
	if (cachedKey) return cachedKey;
	const explicit = process.env.MEMBER_ID_SECRET;
	const base =
		explicit ??
		process.env.AUTH_SECRET ??
		"development-member-id-secret-do-not-use-in-production";
	cachedKey = explicit
		? Buffer.from(explicit)
		: createHmac("sha256", base).update("pairit:member-id").digest();
	return cachedKey;
}

export function memberId(groupId: string, sessionId: string): string {
	const digest = createHmac("sha256", memberIdKey())
		.update(`${groupId}\0${sessionId}`)
		.digest("base64url");
	return `p_${digest.slice(0, 12)}`;
}

/** What a group member sees as a message's sender. Agents and system pass through. */
export function publicSenderId(groupId: string, senderId: string): string {
	if (senderId === "system" || senderId.startsWith("agent:")) return senderId;
	return memberId(groupId, senderId);
}
