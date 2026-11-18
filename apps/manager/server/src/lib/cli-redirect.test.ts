import { describe, expect, test } from "bun:test";
import { validateCliRedirect } from "./cli-redirect";

describe("validateCliRedirect", () => {
	test.each([
		"http://127.0.0.1:53111",
		"http://127.0.0.1:53111/",
		"http://localhost:53111",
	])("accepts %s", (raw) => {
		expect(validateCliRedirect(raw)?.port).toBe("53111");
	});

	test.each([
		"javascript://localhost/%0aalert(1)",
		"javascript://127.0.0.1:1/%0aalert(1)",
		"data://localhost:1/text/html,<script>alert(1)</script>",
		"https://localhost:1",
		"http://localhost",
		"http://127.0.0.1",
		"http://u:p@127.0.0.1:1",
		"http://evil.com:1",
		"http://localhost.evil.com:1",
		"http://127.0.0.1.nip.io:1",
		"not a url",
		"",
		undefined,
	])("rejects %p", (raw) => {
		expect(validateCliRedirect(raw)).toBeNull();
	});
});
