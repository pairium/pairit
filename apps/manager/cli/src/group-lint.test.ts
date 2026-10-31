import { describe, expect, test } from "bun:test";
import { lintGroupView } from "./group-lint";

const workspacePage = {
	id: "decide",
	components: [
		{
			type: "live-workspace",
			props: {
				mode: "structured",
				scope: "group",
				fields: [{ id: "r1_team_answer" }],
			},
		},
	],
};

function config(text: string, extra: Record<string, unknown> = {}) {
	return {
		matchmaking: [{ id: "pairs", num_users: 2, share: ["r1_estimate"] }],
		pages: [
			workspacePage,
			{ id: "discuss", components: [{ type: "text", props: { text } }] },
		],
		...extra,
	};
}

describe("lintGroupView", () => {
	test("accepts shared keys and group workspace fields", () => {
		expect(
			lintGroupView(
				config(
					"{{group.others.0.r1_estimate}} and {{group.ws.r1_team_answer}}",
				),
			),
		).toEqual([]);
	});

	test("ignores the word group in plain text", () => {
		expect(lintGroupView(config("Talk with your group. Then decide."))).toEqual(
			[],
		);
	});

	test("flags a key that isn't shared", () => {
		expect(lintGroupView(config("{{group.others.0.condition}}"))).toEqual([
			"discuss: group.others.0.condition reads condition, which no matchmaking pool lists in share",
		]);
	});

	test("flags an unknown workspace field", () => {
		expect(lintGroupView(config("{{group.ws.answer}}"))).toEqual([
			"discuss: group.ws.answer is not a field of a structured group workspace",
		]);
	});

	test("flags other group names", () => {
		expect(lintGroupView(config("{{group.partner.r1_estimate}}"))).toEqual([
			"discuss: group.partner.r1_estimate should start with group.ws or group.others",
		]);
	});

	test("checks when conditions and agent prompts", () => {
		const errors = lintGroupView({
			...config(""),
			pages: [
				workspacePage,
				{
					id: "discuss",
					components: [
						{ type: "text", when: "group.ws.missing == 1", props: {} },
					],
				},
			],
			agents: [
				{
					id: "mediator",
					system: "Partner said {{group.others.0.secret}}",
				},
			],
		});
		expect(errors).toEqual([
			"discuss: group.ws.missing is not a field of a structured group workspace",
			"agent mediator: group.others.0.secret reads secret, which no matchmaking pool lists in share",
		]);
	});

	test("flags a share that isn't a list of keys", () => {
		expect(
			lintGroupView({
				matchmaking: [{ id: "pairs", share: "r1_estimate" }],
				pages: [],
			}),
		).toEqual(["matchmaking[0].share must be a list of session_state keys"]);
	});

	test("flags a field id used by two group workspaces", () => {
		expect(
			lintGroupView({
				pages: [workspacePage, { ...workspacePage, id: "decide2" }],
			}),
		).toEqual([
			"group workspace field r1_team_answer is on both decide and decide2; group.ws needs unique field ids",
		]);
	});
});
