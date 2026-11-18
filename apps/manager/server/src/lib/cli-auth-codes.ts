/**
 * One-time codes that hand a Better Auth session to the CLI.
 *
 * Only a session that validated in the database mints a code, so anonymous
 * floods cannot fill or churn the store. Each user holds a few pending codes
 * at most; when the store is full, minting fails instead of evicting someone
 * else's code.
 *
 * PKCE (RFC 7636, S256 only): a CLI that sends `code_challenge` at login must
 * send the matching `code_verifier` when it exchanges the code. A code minted
 * without a challenge (an older CLI) exchanges without a verifier, but never
 * with one: a new CLI holding a verifier only accepts codes bound to it, so a
 * challenge-less code injected into its loopback server fails.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const AUTH_CODE_TTL_MS = 2 * 60 * 1000;
export const MAX_CODES_PER_USER = 5;
export const MAX_CODES = 10_000;

const CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/;
const STATE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

export function isValidCodeChallenge(value: unknown): value is string {
	return typeof value === "string" && CHALLENGE_PATTERN.test(value);
}

export function isValidCodeVerifier(value: unknown): value is string {
	return typeof value === "string" && VERIFIER_PATTERN.test(value);
}

export function isValidState(value: unknown): value is string {
	return typeof value === "string" && STATE_PATTERN.test(value);
}

export function s256(verifier: string): string {
	return createHash("sha256").update(verifier).digest("base64url");
}

type Entry = {
	token: string;
	userId: string;
	codeChallenge: string | null;
	expiresAt: number;
};

export type ExchangeResult =
	| { ok: true; token: string }
	| { ok: false; error: "invalid_code" | "invalid_verifier" };

export class CliAuthCodeStore {
	private codes = new Map<string, Entry>();

	constructor(
		private readonly now: () => number = Date.now,
		private readonly limits = {
			ttlMs: AUTH_CODE_TTL_MS,
			perUser: MAX_CODES_PER_USER,
			total: MAX_CODES,
		},
	) {}

	get size(): number {
		return this.codes.size;
	}

	private sweep() {
		const now = this.now();
		for (const [code, entry] of this.codes) {
			if (now > entry.expiresAt) this.codes.delete(code);
		}
	}

	/** Returns null when the store is full. */
	mint(input: {
		token: string;
		userId: string;
		codeChallenge?: string | null;
	}): string | null {
		this.sweep();

		// A user's own oldest code makes room for their next one.
		const mine = [...this.codes].filter(([, e]) => e.userId === input.userId);
		while (mine.length >= this.limits.perUser) {
			const oldest = mine.shift();
			if (oldest) this.codes.delete(oldest[0]);
		}
		if (this.codes.size >= this.limits.total) return null;

		const code = randomBytes(32).toString("hex");
		this.codes.set(code, {
			token: input.token,
			userId: input.userId,
			codeChallenge: input.codeChallenge ?? null,
			expiresAt: this.now() + this.limits.ttlMs,
		});
		return code;
	}

	exchange(code: string, codeVerifier?: string): ExchangeResult {
		const entry = this.codes.get(code);
		if (!entry) return { ok: false, error: "invalid_code" };
		// Single use, whatever the outcome
		this.codes.delete(code);
		if (this.now() > entry.expiresAt)
			return { ok: false, error: "invalid_code" };

		if (entry.codeChallenge) {
			if (!isValidCodeVerifier(codeVerifier)) {
				return { ok: false, error: "invalid_verifier" };
			}
			const expected = Buffer.from(entry.codeChallenge);
			const actual = Buffer.from(s256(codeVerifier));
			if (
				expected.length !== actual.length ||
				!timingSafeEqual(expected, actual)
			) {
				return { ok: false, error: "invalid_verifier" };
			}
		} else if (codeVerifier !== undefined) {
			return { ok: false, error: "invalid_verifier" };
		}

		return { ok: true, token: entry.token };
	}
}
