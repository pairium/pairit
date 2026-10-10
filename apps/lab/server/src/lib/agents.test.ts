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
});
