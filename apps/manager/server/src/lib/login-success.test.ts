import { describe, expect, test } from "bun:test";
import { loginSuccessPage } from "./login-success";

function page(
	cliRedirectUri: unknown,
	{
		sessionToken = "tok" as string | undefined,
		manual = false,
	}: { sessionToken?: string | undefined; manual?: boolean } = {},
) {
	const minted: string[] = [];
	const response = loginSuccessPage({
		sessionToken,
		cliRedirectUri,
		manual,
		mintCode: (token) => {
			minted.push(token);
			return "CODE123";
		},
	});
	return { response, minted };
}

describe("loginSuccessPage", () => {
	test("redirects a loopback CLI with a fresh code", async () => {
		const { response, minted } = page("http://127.0.0.1:53111");
		const html = await response.text();
		expect(minted).toEqual(["tok"]);
		expect(html).toContain("http://127.0.0.1:53111/?code=CODE123");
	});

	test.each([
		"javascript://localhost/%0aalert(document.cookie)",
		"javascript://127.0.0.1:1/%0aalert(document.cookie)",
		"https://evil.com",
	])("mints no code and does not redirect for %p", async (raw) => {
		const { response, minted } = page(raw);
		const html = await response.text();
		expect(minted).toEqual([]);
		expect(html).not.toContain("CODE123");
		expect(html).not.toContain("javascript:");
		expect(html).not.toContain("<script>alert");
		expect(html).toContain('const redirectUrl = "";');
	});

	test("escapes a valid redirect whose path has HTML characters", async () => {
		const { response } = page(
			"http://localhost:1/'\"><script>alert(1)</script>",
		);
		const html = await response.text();
		expect(html).not.toContain("<script>alert");
		expect(html).toContain('<a href="http://localhost:1/&#39;%22%3E%3Cscript');
	});

	test("shows a manual code only when asked", async () => {
		const manual = page(undefined, { manual: true });
		expect(await manual.response.text()).toContain("CODE123");
		const plain = page(undefined);
		expect(plain.minted).toEqual([]);
	});

	test("mints nothing without a session", async () => {
		const minted: string[] = [];
		loginSuccessPage({
			sessionToken: undefined,
			cliRedirectUri: "http://127.0.0.1:53111",
			manual: true,
			mintCode: (token) => {
				minted.push(token);
				return "CODE123";
			},
		});
		expect(minted).toEqual([]);
	});

	test("sends a nonce CSP that matches the script tag", async () => {
		const { response } = page("http://127.0.0.1:53111");
		const csp = response.headers.get("Content-Security-Policy") ?? "";
		const nonce = csp.match(/'nonce-([^']+)'/)?.[1];
		expect(nonce).toBeTruthy();
		expect(csp).toContain("frame-ancestors 'none'");
		expect(await response.text()).toContain(`<script nonce="${nonce}">`);
		expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
	});
});
