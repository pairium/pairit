import { describe, expect, test } from "bun:test";
import { invalidEndRedirectPages } from "./end-redirect";

describe("invalidEndRedirectPages", () => {
	test("accepts http(s) URLs and pages without one", () => {
		expect(
			invalidEndRedirectPages({
				pages: {
					end: {
						id: "end",
						endRedirectUrl: "https://app.prolific.com/submissions/complete",
					},
					intro: { id: "intro" },
				},
			}),
		).toEqual([]);
	});

	test("lists pages with other schemes", () => {
		expect(
			invalidEndRedirectPages({
				pages: {
					a: { id: "a", endRedirectUrl: "javascript:alert(1)" },
					b: { id: "b", endRedirectUrl: "data:text/html,hi" },
					c: { id: "c", endRedirectUrl: "https://ok.test" },
				},
			}),
		).toEqual(["a", "b"]);
		expect(
			invalidEndRedirectPages({
				nodes: [{ id: "end", endRedirectUrl: "not a url" }],
			}),
		).toEqual(["end"]);
	});

	test("ignores configs without pages", () => {
		expect(invalidEndRedirectPages(null)).toEqual([]);
		expect(invalidEndRedirectPages({})).toEqual([]);
	});
});
