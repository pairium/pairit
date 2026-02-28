/**
 * Group membership utilities
 * Shared logic for verifying and resolving chat/workspace group membership
 */

import { getSessionsCollection } from "./db";

/**
 * Verify that a session is a member of a group.
 * - Human-AI chat: groupId === sessionId (legacy)
 * - Session-scoped: groupId starts with "sessionId:"
 * - Matchmaking: session.session_state.chat_group_id === groupId
 */
export async function verifyMembership(
	sessionId: string,
	groupId: string,
): Promise<boolean> {
	if (sessionId === groupId) {
		return true;
	}

	if (groupId.startsWith(`${sessionId}:`)) {
		return true;
	}

	const sessionsCollection = await getSessionsCollection();
	const session = await sessionsCollection.findOne({ id: sessionId });
	if (!session) {
		return false;
	}

	return session.session_state?.chat_group_id === groupId;
}

/**
 * Get all session IDs that are members of a group.
 */
export async function getGroupMembers(groupId: string): Promise<string[]> {
	// Session-scoped groupId (format: "sessionId:something")
	const colonIndex = groupId.indexOf(":");
	if (colonIndex > 0) {
		const sessionId = groupId.substring(0, colonIndex);
		return [sessionId];
	}

	const sessionsCollection = await getSessionsCollection();
	const sessions = await sessionsCollection
		.find({ "session_state.chat_group_id": groupId })
		.project({ id: 1 })
		.toArray();

	return sessions.map((s) => s.id);
}
