import { describe, expect, test } from "bun:test";
import { type MembershipLookups, verifyMembership } from "./groups";

const config = {
	pages: {
		chat: {
			id: "chat",
			components: [{ type: "chat", props: { groupId: "side" } }],
		},
	},
};

type Group = { groupId: string; configId: string; members: string[] };

function lookups(
	sessions: Record<
		string,
		{ configId: string; session_state?: Record<string, unknown> }
	>,
	groups: Group[],
): MembershipLookups {
	return {
		async findSession(id) {
			const s = sessions[id];
			return s ? { configId: s.configId, config } : null;
		},
		async isGroupMember(groupId, configId, sessionId) {
			return groups.some(
				(g) =>
					g.groupId === groupId &&
					g.configId === configId &&
					g.members.includes(sessionId),
			);
		},
	};
}

describe("verifyMembership", () => {
	const groups: Group[] = [
		{ groupId: "g1", configId: "cfg", members: ["a", "b"] },
		{ groupId: "g2", configId: "other", members: ["c"] },
	];

	test("accepts a real group member", async () => {
		const l = lookups({ a: { configId: "cfg" } }, groups);
		expect(await verifyMembership("a", "g1", l)).toBe(true);
	});

	test("ignores chat_group_id in session_state", async () => {
		const l = lookups(
			{ c: { configId: "cfg", session_state: { chat_group_id: "g1" } } },
			groups,
		);
		expect(await verifyMembership("c", "g1", l)).toBe(false);
	});

	test("rejects a member of the same groupId under another config", async () => {
		const l = lookups({ c: { configId: "cfg" } }, [
			...groups,
			{ groupId: "g3", configId: "other", members: ["c"] },
		]);
		expect(await verifyMembership("c", "g3", l)).toBe(false);
	});

	test("accepts session-scoped groups from the config", async () => {
		const l = lookups({ a: { configId: "cfg" } }, groups);
		expect(await verifyMembership("a", "a:chat", l)).toBe(true);
		expect(await verifyMembership("a", "a:side", l)).toBe(true);
		expect(await verifyMembership("a", "a", l)).toBe(true);
	});

	test("rejects an unknown session-scoped suffix", async () => {
		const l = lookups({ a: { configId: "cfg" } }, groups);
		expect(await verifyMembership("a", "a:x", l)).toBe(false);
		expect(await verifyMembership("a", "a:1", l)).toBe(false);
	});

	test("rejects another session's scoped group", async () => {
		const l = lookups(
			{ a: { configId: "cfg" }, b: { configId: "cfg" } },
			groups,
		);
		expect(await verifyMembership("a", "b:chat", l)).toBe(false);
	});

	test("rejects an unknown session", async () => {
		const l = lookups({}, groups);
		expect(await verifyMembership("z", "z:chat", l)).toBe(false);
	});
});
