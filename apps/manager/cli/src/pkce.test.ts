import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { writeCredentialsFile } from "./auth";
import { createLoginSecrets, loginParams, readLoopbackCallback } from "./pkce";

describe("login secrets", () => {
	test("challenge is the S256 of the verifier", () => {
		const s = createLoginSecrets();
		expect(s.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(s.codeChallenge).toBe(
			createHash("sha256").update(s.codeVerifier).digest("base64url"),
		);
		expect(s.state).toMatch(/^[A-Za-z0-9_-]{32}$/);
		expect(createLoginSecrets().state).not.toBe(s.state);
	});

	test("login params carry state and challenge, never the verifier", () => {
		const s = createLoginSecrets();
		const params = loginParams(s);
		expect(params.get("state")).toBe(s.state);
		expect(params.get("code_challenge")).toBe(s.codeChallenge);
		expect(params.get("code_challenge_method")).toBe("S256");
		expect(params.toString()).not.toContain(s.codeVerifier);
		expect(loginParams(null).toString()).toBe("");
	});
});

describe("readLoopbackCallback", () => {
	const s = createLoginSecrets();
	const url = (q: string) => new URL(`http://127.0.0.1:5000/?${q}`);

	test("accepts the code when state matches", () => {
		expect(readLoopbackCallback(url(`code=abc&state=${s.state}`), s)).toEqual({
			code: "abc",
		});
	});

	test.each(["code=abc", "code=abc&state=wrong"])("rejects %p", (q) => {
		expect(readLoopbackCallback(url(q), s)).toEqual({
			error: "State mismatch",
		});
	});

	test("rejects a request without a code", () => {
		expect(readLoopbackCallback(url(`state=${s.state}`), s)).toMatchObject({
			error: "Missing authorization code",
		});
	});

	test("an older server sends no state; the CLI accepts it then", () => {
		expect(readLoopbackCallback(url("code=abc"), null)).toEqual({
			code: "abc",
		});
	});
});

describe("writeCredentialsFile", () => {
	test("makes the directory 0700 and the file 0600, even if they existed", async () => {
		const root = await mkdtemp(path.join(tmpdir(), "pairit-creds-"));
		try {
			const dir = path.join(root, ".pairit");
			const file = path.join(dir, "credentials.json");
			await mkdir(dir, { mode: 0o755 });
			await writeFile(file, "{}", { mode: 0o644 });
			await writeCredentialsFile(dir, file, '{"token":"t"}');
			expect((await stat(dir)).mode & 0o777).toBe(0o700);
			expect((await stat(file)).mode & 0o777).toBe(0o600);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
