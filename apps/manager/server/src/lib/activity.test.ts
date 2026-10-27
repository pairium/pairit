import { describe, expect, test } from "bun:test";
import type { ConfigDocument } from "../types";
import {
	type ActiveSession,
	type ActivityInput,
	configFeatures,
	isGroupStudy,
	isWaitingInMatchmaking,
	summarizeActivity,
} from "./activity";

const NOW = new Date("2026-10-27T12:00:00Z");
const SINCE = new Date("2026-10-26T12:00:00Z");

const groupConfig = {
	initialPageId: "intro",
	pages: {
		intro: { id: "intro", components: [{ type: "text" }] },
		match: {
			id: "match",
			components: [{ type: "matchmaking", props: { poolId: "pool" } }],
		},
		chat: {
			id: "chat",
			components: [{ type: "chat" }, { type: "live-workspace" }],
		},
	},
	matchmaking: [{ id: "pool", num_users: 2 }],
	agents: [{ id: "helper" }],
};

const soloConfig = {
	initialPageId: "survey",
	pages: {
		survey: { id: "survey", components: [{ type: "html" }] },
	},
};

function configDoc(
	configId: string,
	config: unknown,
	extra: Partial<ConfigDocument> = {},
): ConfigDocument {
	return {
		configId,
		config,
		owner: "507f1f77bcf86cd799439011",
		name: configId,
		revision: 3,
		updatedAt: new Date("2026-10-20T00:00:00Z"),
		...extra,
	};
}

function session(
	configId: string,
	currentPageId: string,
	state: Record<string, unknown> = {},
	config: unknown = undefined,
): ActiveSession {
	return { configId, currentPageId, session_state: state, config };
}

function input(overrides: Partial<ActivityInput> = {}): ActivityInput {
	return {
		now: NOW,
		since: SINCE,
		lastActivity: new Map(),
		configs: new Map([
			["group", configDoc("group", groupConfig)],
			["solo", configDoc("solo", soloConfig, { owner: undefined })],
		]),
		ownerEmails: new Map([["507f1f77bcf86cd799439011", "r@example.com"]]),
		activeSessions: [],
		counts: new Map(),
		...overrides,
	};
}

describe("config detection", () => {
	test("a matchmaking pool makes a group study", () => {
		expect(isGroupStudy({ pages: {}, matchmaking: [{ id: "p" }] })).toBe(true);
	});

	test("a matchmaking component makes a group study", () => {
		expect(
			isGroupStudy({
				pages: { m: { id: "m", components: [{ type: "matchmaking" }] } },
			}),
		).toBe(true);
	});

	test("a survey is not a group study", () => {
		expect(isGroupStudy(soloConfig)).toBe(false);
		expect(isGroupStudy({ pages: {}, matchmaking: [] })).toBe(false);
	});

	test("features come from component types and agents", () => {
		expect(configFeatures(groupConfig)).toEqual({
			chat: true,
			liveWorkspace: true,
			html: false,
			agents: true,
		});
		expect(configFeatures(soloConfig)).toEqual({
			chat: false,
			liveWorkspace: false,
			html: true,
			agents: false,
		});
	});

	test("pages listed as an array work too", () => {
		expect(
			configFeatures({ pages: [{ id: "a", components: [{ type: "chat" }] }] })
				.chat,
		).toBe(true);
	});
});

describe("isWaitingInMatchmaking", () => {
	test("uses the session's pinned config", () => {
		const pinned = {
			pages: {
				old: { id: "old", components: [{ type: "matchmaking" }] },
			},
		};
		expect(
			isWaitingInMatchmaking(session("group", "old", {}, pinned), soloConfig),
		).toBe(true);
	});

	test("falls back to the live config", () => {
		expect(isWaitingInMatchmaking(session("group", "match"), groupConfig)).toBe(
			true,
		);
		expect(isWaitingInMatchmaking(session("group", "chat"), groupConfig)).toBe(
			false,
		);
	});

	test("a matched session on the matchmaking page is not waiting", () => {
		expect(
			isWaitingInMatchmaking(
				session("group", "match", { chat_group_id: "g1" }),
				groupConfig,
			),
		).toBe(false);
	});

	test("an unknown page is not waiting", () => {
		expect(isWaitingInMatchmaking(session("group", "gone"), groupConfig)).toBe(
			false,
		);
	});
});

describe("summarizeActivity", () => {
	test("counts active sessions by group and waiting", () => {
		const report = summarizeActivity(
			input({
				lastActivity: new Map([
					["group", new Date("2026-10-27T11:59:00Z")],
					["solo", new Date("2026-10-27T11:00:00Z")],
				]),
				activeSessions: [
					session("group", "chat", { chat_group_id: "g1" }),
					session("group", "chat", { chat_group_id: "g1" }),
					session("group", "match"),
					session("solo", "survey"),
				],
				counts: new Map([
					["group", { total: 127, startedToday: 9, prolific: 120 }],
				]),
			}),
		);

		expect(report.generatedAt).toBe(NOW.toISOString());
		expect(report.since).toBe(SINCE.toISOString());
		expect(report.configs.map((c) => c.configId)).toEqual(["group", "solo"]);

		const [group, solo] = report.configs;
		expect(group).toMatchObject({
			name: "group",
			ownerEmail: "r@example.com",
			revision: 3,
			updatedAt: "2026-10-20T00:00:00.000Z",
			activeNow: { total: 3, inGroup: 2, solo: 1 },
			waitingInMatchmaking: 1,
			startedToday: 9,
			totalSessions: 127,
			prolificSessions: 120,
			isGroupStudy: true,
		});
		expect(solo).toMatchObject({
			ownerId: null,
			ownerEmail: null,
			activeNow: { total: 1, inGroup: 0, solo: 1 },
			waitingInMatchmaking: 0,
			totalSessions: 0,
			isGroupStudy: false,
		});
		expect(report.liveGroupStudies.map((c) => c.configId)).toEqual(["group"]);
	});

	test("a group study with no active sessions is not live", () => {
		const report = summarizeActivity(
			input({
				lastActivity: new Map([["group", new Date("2026-10-27T09:00:00Z")]]),
			}),
		);
		expect(report.configs).toHaveLength(1);
		expect(report.configs[0].activeNow.total).toBe(0);
		expect(report.liveGroupStudies).toEqual([]);
	});

	test("live group studies sort before busier solo studies", () => {
		const report = summarizeActivity(
			input({
				activeSessions: [
					session("solo", "survey"),
					session("solo", "survey"),
					session("group", "match"),
				],
			}),
		);
		expect(report.configs.map((c) => c.configId)).toEqual(["group", "solo"]);
	});

	test("keeps sessions whose config was deleted", () => {
		const report = summarizeActivity(
			input({ activeSessions: [session("deleted", "p")] }),
		);
		expect(report.configs[0]).toMatchObject({
			configId: "deleted",
			name: null,
			isGroupStudy: false,
			activeNow: { total: 1, inGroup: 0, solo: 1 },
		});
	});
});
