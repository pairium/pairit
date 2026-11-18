import { describe, expect, test } from "bun:test";
import { getPath } from "./config-lookup";
import { interpolate } from "./prompt-resolver";
import {
	filterProtectedUpdates,
	getOwnPath,
	hasOverlappingPaths,
	isSafeStatePath,
	PROTECTED_STATE_KEYS,
} from "./session-state";

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

describe("filterProtectedUpdates", () => {
	const keys = [...PROTECTED_STATE_KEYS, "arm", "assign.cond"];

	test("drops protected keys and their sub-paths", () => {
		const { allowed, ignored } = filterProtectedUpdates(
			{
				age: 30,
				chat_group_id: "g",
				group_id: "g",
				treatment: "A",
				"chat.messages_sent": 0,
				arm: "x",
				"answers.q1": "yes",
			},
			keys,
		);
		expect(allowed).toEqual({ age: 30, "answers.q1": "yes" });
		expect(ignored.sort()).toEqual(
			[
				"arm",
				"chat.messages_sent",
				"chat_group_id",
				"group_id",
				"treatment",
			].sort(),
		);
	});

	test("drops a parent of a protected key", () => {
		const { allowed, ignored } = filterProtectedUpdates(
			{ assign: { cond: "x" }, "assign.other": 1, chatter: 1 },
			keys,
		);
		expect(ignored).toEqual(["assign"]);
		expect(allowed).toEqual({ "assign.other": 1, chatter: 1 });
	});
});

describe("isSafeStatePath", () => {
	test("accepts plain dotted paths", () => {
		expect(isSafeStatePath("rating")).toBe(true);
		expect(isSafeStatePath("survey.q1")).toBe(true);
	});

	test("rejects operators, empty segments and prototype segments", () => {
		for (const path of [
			"",
			"$set",
			"a.$b",
			".a",
			"a.",
			"a..b",
			"__proto__",
			"__proto__.endRedirectUrl",
			"a.constructor.prototype",
			"prototype",
		]) {
			expect(isSafeStatePath(path)).toBe(false);
		}
	});
});

describe("getOwnPath", () => {
	test("reads own properties only", () => {
		expect(getOwnPath({ a: { b: 1 } }, "a.b")).toBe(1);
		expect(getOwnPath({ a: {} }, "a.toString")).toBeUndefined();
		expect(getOwnPath({ a: {} }, "a.constructor.name")).toBeUndefined();
		expect(getOwnPath({ a: {} }, "a.__proto__")).toBeUndefined();
	});

	test("prompts and config lookups don't read the prototype", () => {
		expect(
			interpolate("x={{session_state.constructor}}", { session_state: {} }),
		).toBe("x={{session_state.constructor}}");
		expect(getPath({}, "constructor.name")).toBeUndefined();
	});
});
