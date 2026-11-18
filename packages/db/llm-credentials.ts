/**
 * AES-256-GCM encryption for per-config LLM API keys.
 *
 * New ciphertexts (`v: 2`) bind `{configId, provider}` as additional
 * authenticated data, so a ciphertext copied to another config or provider
 * fails to decrypt. Ciphertexts without `v` predate the binding and decrypt
 * without AAD.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { EncryptedSecret } from "./types";

export type LlmProvider = "openai" | "anthropic";

export type LlmSecretContext = { configId: string; provider: LlmProvider };

export function getCredentialsEncryptionKey(): Buffer {
	const raw = process.env.CREDENTIALS_ENCRYPTION_KEY;
	if (!raw) {
		throw new Error(
			"CREDENTIALS_ENCRYPTION_KEY is required for per-config LLM credentials",
		);
	}

	const trimmed = raw.trim();
	if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
		return Buffer.from(trimmed, "hex");
	}

	const base64 = Buffer.from(trimmed, "base64");
	if (base64.length === 32) {
		return base64;
	}

	throw new Error(
		"CREDENTIALS_ENCRYPTION_KEY must be 32 bytes, base64-encoded or 64-char hex",
	);
}

function aad({ configId, provider }: LlmSecretContext): Buffer {
	return Buffer.from(JSON.stringify({ configId, provider }), "utf8");
}

export function encryptLlmSecret(
	value: string,
	context: LlmSecretContext,
	key: Buffer = getCredentialsEncryptionKey(),
): EncryptedSecret {
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", key, iv);
	cipher.setAAD(aad(context));
	const ciphertext = Buffer.concat([
		cipher.update(value, "utf8"),
		cipher.final(),
	]);
	return {
		v: 2,
		iv: iv.toString("base64"),
		ciphertext: ciphertext.toString("base64"),
		authTag: cipher.getAuthTag().toString("base64"),
	};
}

export function decryptLlmSecret(
	secret: EncryptedSecret,
	context: LlmSecretContext,
	key: Buffer = getCredentialsEncryptionKey(),
): string {
	const decipher = createDecipheriv(
		"aes-256-gcm",
		key,
		Buffer.from(secret.iv, "base64"),
	);
	if (secret.v === 2) decipher.setAAD(aad(context));
	decipher.setAuthTag(Buffer.from(secret.authTag, "base64"));
	return Buffer.concat([
		decipher.update(Buffer.from(secret.ciphertext, "base64")),
		decipher.final(),
	]).toString("utf8");
}
