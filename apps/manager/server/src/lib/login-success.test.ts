import { describe, expect, test } from "bun:test";
import { type LoginSuccessInput, loginSuccessPage } from "./login-success";

const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const STATE = "abcdefghijklmnop0123";

type Minted = { token: string; userId: string; codeChallenge: string | null };

function page(
	cliRedirectUri: unknown,
	overrides: Partial<Omit<LoginSuccessInput, "mintCode" | "cliRedirectUri">> & {
		mintResult?: string | null;
	} = {},
) {
	const minted: Minted[] = [];
	const { mintResult = "CODE123", ...rest } = overrides;
	const response = loginSuccessPage({
		session: { token: "tok", userId: "u1" },
		manual: false,
		...rest,
		cliRedirectUri,
		mintCode: (input) => {
			minted.push(input);
			return mintResult;
		},
	});
	return { response, minted };
}

describe("loginSuccessPage", () => {
	test("redirects a loopback CLI with a fresh code", async () => {
		const { response, minted } = page("http://127.0.0.1:53111");
		const html = await response.text();
		expect(minted).toEqual([
			{ token: "tok", userId: "u1", codeChallenge: null },
		]);
		expect(html).toContain("http://127.0.0.1:53111/?code=CODE123");
	});

	test("echoes state and binds the code to the PKCE challenge", async () => {
		const { response, minted } = page("http://127.0.0.1:53111", {
			state: STATE,
			codeChallenge: CHALLENGE,
			codeChallengeMethod: "S256",
		});
		expect(minted[0]?.codeChallenge).toBe(CHALLENGE);
		expect(await response.text()).toContain(
			`http://127.0.0.1:53111/?code=CODE123&amp;state=${STATE}`,
		);
	});

	test.each([
		[{ codeChallenge: CHALLENGE, codeChallengeMethod: "plain" }],
		[{ codeChallenge: CHALLENGE }],
		[{ codeChallenge: "short", codeChallengeMethod: "S256" }],
		[{ state: "bad state!" }],
	])("refuses a malformed login request %p", async (input) => {
		const { response, minted } = page("http://127.0.0.1:53111", input);
		expect(response.status).toBe(400);
		expect(minted).toEqual([]);
		expect(await response.text()).not.toContain("CODE123");
	});

	test("shows an error when no code can be minted", async () => {
		const { response } = page("http://127.0.0.1:53111", {
			mintResult: null,
		});
		expect(response.status).toBe(400);
		expect(await response.text()).toContain("busy");
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

	test("mints nothing without a validated session", async () => {
		const { minted } = page("http://127.0.0.1:53111", {
			session: null,
			manual: true,
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
