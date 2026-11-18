import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { CliAuthCodeStore, isValidCodeChallenge, s256 } from "./cli-auth-codes";

const verifier = () => randomBytes(32).toString("base64url");

function store(limits = { ttlMs: 1000, perUser: 3, total: 10 }) {
	let now = 0;
	const s = new CliAuthCodeStore(() => now, limits);
	return {
		s,
		advance: (ms: number) => {
			now += ms;
		},
	};
}

describe("s256", () => {
	test("is an unpadded base64url SHA-256 (43 chars)", () => {
		expect(s256("abc")).toBe("ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0");
		expect(isValidCodeChallenge(s256(verifier()))).toBe(true);
	});
});

describe("CliAuthCodeStore", () => {
	test("exchanges a PKCE code once, with the right verifier", () => {
		const { s } = store();
		const v = verifier();
		const code = s.mint({ token: "t", userId: "u", codeChallenge: s256(v) });
		expect(code).toBeTruthy();
		expect(s.exchange(code as string, v)).toEqual({ ok: true, token: "t" });
		expect(s.exchange(code as string, v)).toEqual({
			ok: false,
			error: "invalid_code",
		});
	});

	test("rejects a wrong or missing verifier and burns the code", () => {
		const { s } = store();
		const v = verifier();
		const a = s.mint({ token: "t", userId: "u", codeChallenge: s256(v) });
		expect(s.exchange(a as string, verifier())).toMatchObject({
			error: "invalid_verifier",
		});
		expect(s.exchange(a as string, v)).toMatchObject({ error: "invalid_code" });

		const b = s.mint({ token: "t", userId: "u", codeChallenge: s256(v) });
		expect(s.exchange(b as string)).toMatchObject({
			error: "invalid_verifier",
		});
	});

	test("legacy codes exchange without a verifier, never with one", () => {
		const { s } = store();
		const a = s.mint({ token: "t", userId: "u" });
		expect(s.exchange(a as string)).toEqual({ ok: true, token: "t" });
		// An attacker's challenge-less code injected into a new CLI fails
		const b = s.mint({ token: "attacker", userId: "evil" });
		expect(s.exchange(b as string, verifier())).toMatchObject({
			error: "invalid_verifier",
		});
	});

	test("codes expire", () => {
		const { s, advance } = store();
		const code = s.mint({ token: "t", userId: "u" });
		advance(1001);
		expect(s.exchange(code as string)).toMatchObject({ error: "invalid_code" });
	});

	test("caps codes per user by dropping that user's oldest", () => {
		const { s } = store();
		const first = s.mint({ token: "t1", userId: "u" });
		s.mint({ token: "t2", userId: "u" });
		s.mint({ token: "t3", userId: "u" });
		const other = s.mint({ token: "o", userId: "other" });
		s.mint({ token: "t4", userId: "u" });
		expect(s.size).toBe(4);
		expect(s.exchange(first as string)).toMatchObject({
			error: "invalid_code",
		});
		expect(s.exchange(other as string)).toEqual({ ok: true, token: "o" });
	});

	test("a full store refuses new codes instead of evicting others", () => {
		const { s, advance } = store({ ttlMs: 1000, perUser: 1, total: 2 });
		const a = s.mint({ token: "a", userId: "a" });
		s.mint({ token: "b", userId: "b" });
		expect(s.mint({ token: "c", userId: "c" })).toBeNull();
		expect(s.exchange(a as string)).toEqual({ ok: true, token: "a" });
		advance(1001);
		expect(s.mint({ token: "c", userId: "c" })).toBeTruthy();
	});
});
