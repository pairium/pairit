import { describe, expect, test } from "bun:test";
import { createCipheriv, randomBytes } from "node:crypto";
import { decryptLlmSecret, encryptLlmSecret } from "./llm-credentials";
import type { EncryptedSecret } from "./types";

const key = randomBytes(32);
const ctx = { configId: "cfg-1", provider: "openai" } as const;

function legacyEncrypt(value: string): EncryptedSecret {
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", key, iv);
	const ciphertext = Buffer.concat([cipher.update(value), cipher.final()]);
	return {
		iv: iv.toString("base64"),
		ciphertext: ciphertext.toString("base64"),
		authTag: cipher.getAuthTag().toString("base64"),
	};
}

describe("LLM secret encryption", () => {
	test("round-trips with the same config and provider", () => {
		const secret = encryptLlmSecret("sk-test", ctx, key);
		expect(secret.v).toBe(2);
		expect(decryptLlmSecret(secret, ctx, key)).toBe("sk-test");
	});

	test("fails for another config or provider", () => {
		const secret = encryptLlmSecret("sk-test", ctx, key);
		expect(() =>
			decryptLlmSecret(secret, { ...ctx, configId: "cfg-2" }, key),
		).toThrow();
		expect(() =>
			decryptLlmSecret(secret, { ...ctx, provider: "anthropic" }, key),
		).toThrow();
	});

	test("still decrypts legacy ciphertexts without AAD", () => {
		expect(decryptLlmSecret(legacyEncrypt("sk-old"), ctx, key)).toBe("sk-old");
	});

	test("a v2 ciphertext stripped of its version does not decrypt", () => {
		const { v: _v, ...stripped } = encryptLlmSecret("sk-test", ctx, key);
		expect(() => decryptLlmSecret(stripped, ctx, key)).toThrow();
	});
});
