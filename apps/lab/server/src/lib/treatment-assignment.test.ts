import { describe, expect, test } from "bun:test";
import {
	distributeConditions,
	getEffectiveBalanceKey,
	sessionBalanceFilter,
} from "./treatment-assignment";

describe("treatment-assignment balance isolation", () => {
	test("live and simulated sessions use separate balance keys", () => {
		expect(getEffectiveBalanceKey("my-study:treatment")).toBe(
			"my-study:treatment",
		);
		expect(getEffectiveBalanceKey("my-study:treatment", true)).toBe(
			"my-study:treatment:sim",
		);
	});

	test("live rebuild excludes simulated sessions", () => {
		expect(sessionBalanceFilter(false)).toEqual({ simulated: { $ne: true } });
	});

	test("simulated rebuild only counts simulated sessions", () => {
		expect(sessionBalanceFilter(true)).toEqual({ simulated: true });
	});
});

describe("distributeConditions", () => {
	test("gives each member a different condition", () => {
		const result = distributeConditions(
			["ai_estimate", "no_estimate"],
			["s1", "s2"],
		);
		expect(Object.keys(result).sort()).toEqual(["s1", "s2"]);
		expect(Object.values(result).sort()).toEqual([
			"ai_estimate",
			"no_estimate",
		]);
	});

	test("keeps repeated conditions", () => {
		const result = distributeConditions(
			["leader", "follower", "follower"],
			["s1", "s2", "s3"],
		);
		expect(Object.values(result).sort()).toEqual([
			"follower",
			"follower",
			"leader",
		]);
	});

	test("shuffles which member gets which condition", () => {
		const first = distributeConditions(["a", "b"], ["s1", "s2"], () => 0);
		const second = distributeConditions(["a", "b"], ["s1", "s2"], () => 0.99);
		expect(first.s1).not.toBe(second.s1);
	});

	test("rejects a list that does not match the group size", () => {
		expect(() => distributeConditions(["a", "b"], ["s1", "s2", "s3"])).toThrow(
			"one condition per group member",
		);
	});
});
