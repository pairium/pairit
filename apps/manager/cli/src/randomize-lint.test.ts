import { describe, expect, test } from "bun:test";
import { lintRandomization } from "./randomize-lint";

const pairPool = [{ id: "main_pool", num_users: 2 }];

function onEnterConfig(
	action: Record<string, unknown>,
	matchmaking = pairPool,
) {
	return {
		matchmaking,
		pages: [{ id: "task", onEnter: [{ type: "randomize", ...action }] }],
	};
}

describe("lintRandomization", () => {
	test("accepts one condition per member", () => {
		const config = onEnterConfig({
			scope: "group",
			distribute: true,
			conditions: ["ai_estimate", "no_estimate"],
		});
		expect(lintRandomization(config)).toEqual([]);
	});

	test("accepts repeated conditions that match the group size", () => {
		const config = onEnterConfig(
			{
				scope: "group",
				distribute: true,
				conditions: ["leader", "follower", "follower"],
			},
			[{ id: "trio", num_users: 3 }],
		);
		expect(lintRandomization(config)).toEqual([]);
	});

	test("flags a list that does not match the group size", () => {
		const config = onEnterConfig({
			scope: "group",
			distribute: true,
			conditions: ["leader", "follower", "follower"],
		});
		expect(lintRandomization(config)).toEqual([
			"task.onEnter[0]: distribute: true needs one condition per group member (3 conditions, groups of 2)",
		]);
	});

	test("flags distribute without group scope", () => {
		const config = onEnterConfig({
			distribute: true,
			conditions: ["a", "b"],
		});
		expect(lintRandomization(config)).toEqual([
			"task.onEnter[0]: distribute: true needs scope: group",
		]);
	});

	test("skips the size check when pools differ in size", () => {
		const config = onEnterConfig(
			{ scope: "group", distribute: true, conditions: ["a", "b", "c"] },
			[
				{ id: "pairs", num_users: 2 },
				{ id: "trios", num_users: 3 },
			],
		);
		expect(lintRandomization(config)).toEqual([]);
	});

	test("checks randomization components too", () => {
		const config = {
			matchmaking: pairPool,
			pages: [
				{
					id: "assign",
					components: [
						{
							type: "randomization",
							props: { scope: "group", distribute: true, conditions: ["a"] },
						},
					],
				},
			],
		};
		expect(lintRandomization(config)).toEqual([
			"assign.components[0]: distribute: true needs one condition per group member (1 conditions, groups of 2)",
		]);
	});
});
