import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { mediaObjectFromUrl } from "./media-path";

describe("mediaObjectFromUrl", () => {
	test.each([
		["http://m.test/media/a.png", "a.png"],
		["http://m.test/media/onboarding%2Fhero.png", "onboarding/hero.png"],
		["http://m.test/media/a%2fb%2Fc%20d.png", "a/b/c d.png"],
		// A literal "%2F" in a name is not turned into a slash
		["http://m.test/media/a%252Fb.png", "a%2Fb.png"],
		["http://m.test/media/100%25.png", "100%.png"],
	])("%s -> %s", (url, expected) => {
		expect(mediaObjectFromUrl(url)).toBe(expected);
	});

	test("refuses a path that is not validly encoded", () => {
		expect(mediaObjectFromUrl("http://m.test/media/a%E0%A4%A")).toBeNull();
		expect(mediaObjectFromUrl("http://m.test/media/")).toBeNull();
	});

	test("a route still matches an encoded slash and sees the full name", async () => {
		const app = new Elysia({ prefix: "/media" }).delete(
			"/:object",
			({ request }) => ({ object: mediaObjectFromUrl(request.url) }),
		);
		const response = await app.handle(
			new Request("http://localhost/media/onboarding%2Fhero.png", {
				method: "DELETE",
			}),
		);
		expect(await response.json()).toEqual({ object: "onboarding/hero.png" });
	});
});
