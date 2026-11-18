import { afterEach, describe, expect, test } from "vitest";
import { getScopePath } from "../runtime/expression";
import { getOwnPath, isSafePath, mergeNestedUpdates } from "./state-path";

afterEach(() => {
	// Nothing below may reach Object.prototype
	expect(({} as Record<string, unknown>).polluted).toBeUndefined();
	expect(({} as Record<string, unknown>).endRedirectUrl).toBeUndefined();
});

describe("mergeNestedUpdates", () => {
	test("sets top-level and nested paths", () => {
		expect(
			mergeNestedUpdates({ a: 1, b: { c: 2 } }, { a: 3, "b.d": 4, "e.f": 5 }),
		).toEqual({ a: 3, b: { c: 2, d: 4 }, e: { f: 5 } });
	});

	test("does not change the base", () => {
		const base = { b: { c: 2 } };
		mergeNestedUpdates(base, { "b.c": 3 });
		expect(base).toEqual({ b: { c: 2 } });
	});

	test("skips paths through __proto__, constructor or prototype", () => {
		const next = mergeNestedUpdates(
			{ ok: 1 },
			{
				"__proto__.polluted": true,
				"__proto__.endRedirectUrl": "javascript:alert(1)",
				"constructor.prototype.polluted": true,
				"a.__proto__.polluted": true,
				"a.prototype": 1,
				"a..b": 1,
			},
		);
		expect(next).toEqual({ ok: 1 });
		// An own "__proto__" key, as JSON.parse makes from an SSE payload
		const fromJson = JSON.parse('{"__proto__": {"polluted": true}}');
		expect(mergeNestedUpdates({}, fromJson)).toEqual({});
	});
});

describe("getOwnPath", () => {
	test("reads own properties only", () => {
		const scope = { session_state: { a: { b: 2 } } };
		expect(getOwnPath(scope, "session_state.a.b")).toBe(2);
		expect(getOwnPath(scope, "session_state.toString")).toBeUndefined();
		expect(getOwnPath(scope, "session_state.constructor")).toBeUndefined();
		expect(getOwnPath(scope, "session_state.__proto__")).toBeUndefined();
	});

	test("getScopePath does not read the prototype", () => {
		expect(
			getScopePath({ session_state: {} }, "session_state.constructor.name"),
		).toBeUndefined();
		expect(
			getScopePath(
				{ session_state: {}, group: { ws: {}, others: [{ x: 1 }] } },
				"group.others.0.x",
			),
		).toBe(1);
	});
});

describe("isSafePath", () => {
	test("rejects prototype segments and empty segments", () => {
		expect(isSafePath("a.b")).toBe(true);
		expect(isSafePath("a.__proto__")).toBe(false);
		expect(isSafePath("constructor")).toBe(false);
		expect(isSafePath("a.prototype.b")).toBe(false);
		expect(isSafePath(".a")).toBe(false);
	});
});
