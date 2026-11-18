import { describe, expect, test } from "bun:test";
import {
	checkSessionAccess,
	hashSessionSecret,
	mintSessionSecret,
	parseCookies,
	secretMatches,
	sessionCookieName,
	sessionIdsFromCookies,
} from "./session-access";

const SID = "11111111-2222-3333-4444-555555555555";

function req(cookie?: string) {
	return new Request("http://lab.test/x", {
		headers: cookie ? { cookie } : {},
	});
}

const noUser = async () => null;

describe("mintSessionSecret", () => {
	test("returns a random secret and its sha256", () => {
		const a = mintSessionSecret();
		const b = mintSessionSecret();
		expect(a.secret).not.toBe(b.secret);
		expect(a.hash).toBe(hashSessionSecret(a.secret));
		expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
	});
});

describe("secretMatches", () => {
	const { secret, hash } = mintSessionSecret();
	test("matches the right secret", () => {
		expect(secretMatches(secret, hash)).toBe(true);
	});
	test.each([
		["wrong secret", "nope", hash],
		["missing secret", undefined, hash],
		["missing hash", secret, undefined],
		["malformed hash", secret, "zz"],
	])("rejects %s", (_name, s, h) => {
		expect(
			secretMatches(s as string | undefined, h as string | undefined),
		).toBe(false);
	});
});

describe("parseCookies", () => {
	test("reads several cookies and ignores junk", () => {
		const cookies = parseCookies("a=1; b = two ;junk; c=%41");
		expect(cookies.get("a")).toBe("1");
		expect(cookies.get("b")).toBe("two");
		expect(cookies.get("c")).toBe("A");
		expect(cookies.has("junk")).toBe(false);
	});
	test("lists session cookie ids", () => {
		const r = req(
			`${sessionCookieName("s1")}=x; other=y; ${sessionCookieName("s2")}=z`,
		);
		expect(sessionIdsFromCookies(r)).toEqual(["s1", "s2"]);
	});
});

describe("checkSessionAccess", () => {
	const { secret, hash } = mintSessionSecret();
	const session = { id: SID, secretHash: hash, userId: null };

	test("allows the session's cookie", async () => {
		const r = await checkSessionAccess(
			req(`${sessionCookieName(SID)}=${secret}`),
			session,
			noUser,
		);
		expect(r).toEqual({ ok: true, legacy: false });
	});

	test("forbids a request that only knows the sessionId", async () => {
		const r = await checkSessionAccess(req(), session, noUser);
		expect(r).toEqual({ ok: false, status: 403, error: "session_forbidden" });
	});

	test("forbids another session's cookie", async () => {
		const other = mintSessionSecret();
		const r = await checkSessionAccess(
			req(
				`${sessionCookieName("other")}=${other.secret}; ${sessionCookieName(SID)}=${other.secret}`,
			),
			session,
			noUser,
		);
		expect(r.ok).toBe(false);
	});

	test("allows the signed-in owner without a cookie", async () => {
		const r = await checkSessionAccess(
			req(),
			{ ...session, userId: "u1" },
			async () => ({ id: "u1" }),
		);
		expect(r.ok).toBe(true);
	});

	test("forbids a different signed-in user", async () => {
		const r = await checkSessionAccess(
			req(),
			{ ...session, userId: "u1" },
			async () => ({ id: "u2" }),
		);
		expect(r.ok).toBe(false);
	});

	test("lets legacy sessions without a secret through", async () => {
		const r = await checkSessionAccess(req(), { id: SID }, noUser);
		expect(r).toEqual({ ok: true, legacy: true });
	});

	test("404s a missing session", async () => {
		const r = await checkSessionAccess(req(), null, noUser);
		expect(r).toEqual({ ok: false, status: 404, error: "session_not_found" });
	});
});
