import { createDecipheriv } from "node:crypto";
import { getConfigsCollection } from "./db";

type EncryptedSecret = {
	iv: string;
	ciphertext: string;
	authTag: string;
};

type StoredLlmCredentials = {
	openai?: EncryptedSecret;
	anthropic?: EncryptedSecret;
};

export type ResolvedLlmCredentials = {
	openaiApiKey?: string;
	anthropicApiKey?: string;
};

function getEncryptionKey(): Buffer {
	const raw = process.env.CREDENTIALS_ENCRYPTION_KEY;
	if (!raw) {
		throw new Error("CREDENTIALS_ENCRYPTION_KEY is required for per-config LLM credentials");
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

function decryptSecret(secret: EncryptedSecret): string {
	const decipher = createDecipheriv(
		"aes-256-gcm",
		getEncryptionKey(),
		Buffer.from(secret.iv, "base64"),
	);
	decipher.setAuthTag(Buffer.from(secret.authTag, "base64"));

	const plaintext = Buffer.concat([
		decipher.update(Buffer.from(secret.ciphertext, "base64")),
		decipher.final(),
	]);
	return plaintext.toString("utf8");
}

export async function getLlmCredentialsForConfig(
	configId: string,
): Promise<ResolvedLlmCredentials> {
	const collection = await getConfigsCollection();
	const doc = await collection.findOne(
		{ configId },
		{ projection: { llmCredentials: 1 } },
	);
	const stored = doc?.llmCredentials as StoredLlmCredentials | undefined;

	return {
		openaiApiKey: stored?.openai ? decryptSecret(stored.openai) : undefined,
		anthropicApiKey: stored?.anthropic
			? decryptSecret(stored.anthropic)
			: undefined,
	};
}
