import { describe, expect, test } from "bun:test";
import { buildGroupView, groupWorkspacePages, sharedKeys } from "./group-view";
import { resolveSystemPrompt } from "./prompt-resolver";

const config = {
	matchmaking: [
		{ id: "pairs", num_users: 2, share: ["r1_estimate"] },
		{ id: "solo", num_users: 2 },
	],
	pages: {
		discuss: {
			id: "discuss",
			components: [
				{
					type: "live-workspace",
					props: { mode: "structured", scope: "group" },
				},
			],
		},
		notes: {
			id: "notes",
			components: [
				{ type: "live-workspace", props: { mode: "freeform", scope: "group" } },
			],
		},
		mine: {
			id: "mine",
			components: [{ type: "live-workspace", props: { mode: "structured" } }],
		},
	},
};

describe("sharedKeys", () => {
	test("reads the pool's share list", () => {
		expect(sharedKeys(config, "pairs")).toEqual(["r1_estimate"]);
	});

	test("shares nothing without a list", () => {
		expect(sharedKeys(config, "solo")).toEqual([]);
		expect(sharedKeys(config, "missing")).toEqual([]);
	});
});

describe("groupWorkspacePages", () => {
	test("finds structured group workspaces only", () => {
		expect(groupWorkspacePages(config)).toEqual(["discuss"]);
	});
});

describe("buildGroupView", () => {
	const members = [
		{ id: "a", session_state: { r1_estimate: 40, condition: "A" } },
		{ id: "b", session_state: { r1_estimate: 65, condition: "B" } },
		{ id: "c", session_state: { condition: "C" } },
	];

	test("gives the others' shared keys, in join order, and nothing else", () => {
		const view = buildGroupView("b", members, ["r1_estimate"], {
			r1_team_answer: "52",
		});
		expect(view).toEqual({
			ws: { r1_team_answer: "52" },
			others: [{ r1_estimate: 40 }, {}],
		});
	});
});

describe("resolveSystemPrompt with group", () => {
	const group = {
		ws: { r1_team_answer: "52" },
		others: [{ r1_estimate: 65 }],
	};

	test("interpolates group paths", () => {
		expect(
			resolveSystemPrompt(
				"Team: {{group.ws.r1_team_answer}}, partner: {{group.others.0.r1_estimate}}",
				undefined,
				{},
				group,
			),
		).toBe("Team: 52, partner: 65");
	});

	test("branches on group paths", () => {
		expect(
			resolveSystemPrompt(
				"default",
				[
					{ when: "group.others.0.r1_estimate > 50", system: "high" },
					{ system: "low" },
				],
				{},
				group,
			),
		).toBe("high");
	});

	test("leaves a missing value as written", () => {
		expect(
			resolveSystemPrompt("{{group.ws.missing}}", undefined, {}, group),
		).toBe("{{group.ws.missing}}");
	});
});
