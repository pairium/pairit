import { describe, expect, test } from "bun:test";
import { hasOverlappingPaths } from "./session-state";

describe("hasOverlappingPaths", () => {
	test("allows separate fields", () => {
		expect(hasOverlappingPaths(["age", "answers.q1", "answers.q2"])).toBe(
			false,
		);
		expect(hasOverlappingPaths(["a", "ab.c"])).toBe(false);
	});

	test("flags a parent and its child", () => {
		expect(hasOverlappingPaths(["answers", "age", "answers.q1"])).toBe(true);
	});
});
