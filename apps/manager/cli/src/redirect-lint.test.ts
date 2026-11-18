import { describe, expect, test } from "bun:test";
import { isHttpUrl, lintEndRedirectUrls } from "./redirect-lint";

describe("lintEndRedirectUrls", () => {
	test("accepts http(s) URLs and pages without one", () => {
		expect(
			lintEndRedirectUrls({
				pages: [
					{
						id: "end",
						endRedirectUrl:
							"https://app.prolific.com/submissions/complete?cc=ABCD1234",
					},
					{ id: "other", endRedirectUrl: "http://example.com/next" },
					{ id: "intro" },
				],
			}),
		).toEqual([]);
	});

	test("rejects other schemes and non-URLs", () => {
		const errors = lintEndRedirectUrls({
			pages: [
				{ id: "a", endRedirectUrl: "javascript:alert(document.cookie)" },
				{ id: "b", endRedirectUrl: " JavaScript:alert(1)" },
				{ id: "c", endRedirectUrl: "data:text/html,<script>1</script>" },
				{ id: "d", endRedirectUrl: "/relative/path" },
				{ endRedirectUrl: 42 },
			],
		});
		expect(errors).toEqual([
			'page "a": endRedirectUrl must be an http:// or https:// URL',
			'page "b": endRedirectUrl must be an http:// or https:// URL',
			'page "c": endRedirectUrl must be an http:// or https:// URL',
			'page "d": endRedirectUrl must be an http:// or https:// URL',
			"pages[4]: endRedirectUrl must be an http:// or https:// URL",
		]);
	});

	test("isHttpUrl", () => {
		expect(isHttpUrl("https://x.test")).toBe(true);
		expect(isHttpUrl("vbscript:x")).toBe(false);
		expect(isHttpUrl("")).toBe(false);
	});
});
