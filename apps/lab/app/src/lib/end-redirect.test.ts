import { describe, expect, test } from "vitest";
import { isProlificUrl, safeRedirectUrl } from "./end-redirect";

describe("safeRedirectUrl", () => {
	test("keeps http(s) URLs", () => {
		expect(
			safeRedirectUrl("https://app.prolific.com/submissions/complete?cc=AB"),
		).toBe("https://app.prolific.com/submissions/complete?cc=AB");
		expect(safeRedirectUrl("http://example.com")).toBe("http://example.com/");
	});

	test("drops other schemes and non-URLs", () => {
		for (const value of [
			"javascript:alert(1)",
			" JaVaScRiPt:alert(1)",
			"java\tscript:alert(1)",
			"data:text/html,<script>alert(1)</script>",
			"vbscript:x",
			"/relative",
			"",
			null,
			undefined,
			42,
		]) {
			expect(safeRedirectUrl(value)).toBeNull();
		}
	});
});

describe("isProlificUrl", () => {
	test("matches prolific.com, prolific.co and subdomains", () => {
		expect(isProlificUrl("https://app.prolific.com/submissions")).toBe(true);
		expect(isProlificUrl("https://prolific.co/x")).toBe(true);
		expect(isProlificUrl("https://APP.PROLIFIC.CO")).toBe(true);
	});

	test("ignores lookalikes and 'prolific' elsewhere in the URL", () => {
		expect(isProlificUrl("https://evil.test/?prolific")).toBe(false);
		expect(isProlificUrl("https://prolific.com.evil.test")).toBe(false);
		expect(isProlificUrl("https://notprolific.com")).toBe(false);
		expect(isProlificUrl("https://evil.test/prolific.com")).toBe(false);
		expect(isProlificUrl("not a url")).toBe(false);
	});
});
