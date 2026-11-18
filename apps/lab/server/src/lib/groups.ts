/**
 * Group membership utilities
 * Shared logic for verifying and resolving chat/workspace group membership
 */

import { sessionGroupSuffixes } from "./config-lookup";
import { getGroupsCollection, getSessionsCollection } from "./db";

export type MembershipLookups = {
	findSession(
		sessionId: string,
	): Promise<{ configId: string; config: unknown } | null>;
	isGroupMember(
		groupId: string,
		configId: string,
		sessionId: string,
	): Promise<boolean>;
};

const mongoLookups: MembershipLookups = {
	async findSession(sessionId) {
		const sessions = await getSessionsCollection();
		return sessions.findOne(
			{ id: sessionId },
			{ projection: { configId: 1, config: 1 } },
		);
	},
	async isGroupMember(groupId, configId, sessionId) {
		const groups = await getGroupsCollection();
		const group = await groups.findOne(
			{ groupId, configId, memberSessionIds: sessionId },
			{ projection: { _id: 1 } },
		);
		return !!group;
	},
};

/**
 * Verify that a session is a member of a group.
 * - Human-AI chat: groupId === sessionId (legacy)
 * - Session-scoped: `${sessionId}:<suffix>`, where the suffix is a page id or
 *   a chat/workspace groupId in the session's config
 * - Matchmaking: the group document lists the session for its config
 *
 * session_state is writable by the participant, so it is never trusted here.
 */
export async function verifyMembership(
	sessionId: string,
	groupId: string,
	lookups: MembershipLookups = mongoLookups,
): Promise<boolean> {
	if (sessionId === groupId) {
		return true;
	}

	const session = await lookups.findSession(sessionId);
	if (!session) {
		return false;
	}

	const prefix = `${sessionId}:`;
	if (groupId.startsWith(prefix)) {
		const suffix = groupId.slice(prefix.length);
		return sessionGroupSuffixes(session.config).has(suffix);
	}

	return lookups.isGroupMember(groupId, session.configId, sessionId);
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

	const groups = await getGroupsCollection();
	const group = await groups.findOne(
		{ groupId },
		{ projection: { memberSessionIds: 1 } },
	);
	return group?.memberSessionIds ?? [];
}
