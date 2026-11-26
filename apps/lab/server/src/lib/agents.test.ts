import { describe, expect, test } from "bun:test";
import { getAgentsFromConfig, getPageAgentIdsFromConfig } from "./agents";

const config = {
	initialPageId: "intro",
	pages: {
		intro: { id: "intro", components: [{ type: "text", props: {} }] },
		chat: {
			id: "chat",
			components: [
				{ type: "chat", props: { agents: ["helper"] } },
				{ type: "live-workspace", props: { agents: ["editor"] } },
				{ type: "buttons", props: { agents: ["ignored"] } },
			],
		},
	},
	agents: [
		{
			id: "helper",
			model: "gpt-4o",
			system: "Be helpful.",
			trigger: "on_join",
		},
		{ id: "editor", model: "claude-sonnet-5-5", system: "Edit." },
		{ id: "broken", model: "gpt-4o" },
	],
};

describe("getAgentsFromConfig", () => {
	test("returns valid agents and drops incomplete ones", () => {
		const agents = getAgentsFromConfig(config);
		expect(agents.map((a) => a.id)).toEqual(["helper", "editor"]);
		expect(agents[0]?.trigger).toBe("on_join");
	});

	test("missing or malformed config has no agents", () => {
		expect(getAgentsFromConfig(null)).toEqual([]);
		expect(getAgentsFromConfig(undefined)).toEqual([]);
		expect(getAgentsFromConfig({ pages: {} })).toEqual([]);
		expect(getAgentsFromConfig({ agents: "helper" })).toEqual([]);
	});
});

describe("getPageAgentIdsFromConfig", () => {
	test("collects agents from chat and live-workspace components", () => {
		expect(getPageAgentIdsFromConfig(config, "chat")).toEqual([
			"helper",
			"editor",
		]);
	});

	test("an agent on both the chat and the workspace is listed once", () => {
		const shared = {
			pages: {
				p: {
					id: "p",
					components: [
						{ type: "chat", props: { agents: ["writer"] } },
						{ type: "live-workspace", props: { agents: ["writer"] } },
					],
				},
			},
		};
		expect(getPageAgentIdsFromConfig(shared, "p")).toEqual(["writer"]);
	});

	test("page without agent components", () => {
		expect(getPageAgentIdsFromConfig(config, "intro")).toEqual([]);
	});

	test("unknown page or missing config", () => {
		expect(getPageAgentIdsFromConfig(config, "nope")).toEqual([]);
		expect(getPageAgentIdsFromConfig(null, "chat")).toEqual([]);
	});

	test("legacy configs with a nodes array", () => {
		const legacy = {
			nodes: [
				{
					id: "chat",
					components: [{ type: "chat", props: { agents: ["a"] } }],
				},
			],
		};
		expect(getPageAgentIdsFromConfig(legacy, "chat")).toEqual(["a"]);
	});

	test("filters agents by chat scope when a page has both a team chat and a private AI chat", () => {
		const multiChat = {
			pages: {
				collab: {
					id: "collab",
					components: [
						{ type: "chat", props: { scope: "group" } },
						{
							type: "chat",
							props: { scope: "participant", agents: ["claude"] },
						},
					],
				},
			},
		};
		// Message in the team chat should NOT trigger the private chat's agent
		expect(
			getPageAgentIdsFromConfig(multiChat, "collab", {
				groupId: "team-123",
				sessionId: "sess-1",
				sessionState: { chat_group_id: "team-123" },
			}),
		).toEqual([]);
		// Message in the participant's private chat SHOULD trigger Claude
		expect(
			getPageAgentIdsFromConfig(multiChat, "collab", {
				groupId: "sess-1:collab",
				sessionId: "sess-1",
				sessionState: { chat_group_id: "team-123" },
			}),
		).toEqual(["claude"]);
	});

	test("filters agents by explicit groupId when two private chats share a page", () => {
		const twoPrivate = {
			pages: {
				split: {
					id: "split",
					components: [
						{
							type: "chat",
							props: {
								scope: "participant",
								groupId: "coach",
								agents: ["coach_ai"],
							},
						},
						{
							type: "chat",
							props: {
								scope: "participant",
								groupId: "critic",
								agents: ["critic_ai"],
							},
						},
					],
				},
			},
		};
		expect(
			getPageAgentIdsFromConfig(twoPrivate, "split", {
				groupId: "sess-1:coach",
				sessionId: "sess-1",
				sessionState: { chat_group_id: "team-123" },
			}),
		).toEqual(["coach_ai"]);
		expect(
			getPageAgentIdsFromConfig(twoPrivate, "split", {
				groupId: "sess-1:critic",
				sessionId: "sess-1",
				sessionState: { chat_group_id: "team-123" },
			}),
		).toEqual(["critic_ai"]);
	});
});
