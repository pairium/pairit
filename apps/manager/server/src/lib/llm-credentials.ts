import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type LlmCredentialInput = {
	openaiApiKey?: string;
	anthropicApiKey?: string;
};

export type EncryptedSecret = {
	iv: string;
	ciphertext: string;
	authTag: string;
};

export type StoredLlmCredentials = {
	openai?: EncryptedSecret;
	anthropic?: EncryptedSecret;
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

function encryptSecret(value: string): EncryptedSecret {
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
	const ciphertext = Buffer.concat([
		cipher.update(value, "utf8"),
		cipher.final(),
	]);
	const authTag = cipher.getAuthTag();

	return {
		iv: iv.toString("base64"),
		ciphertext: ciphertext.toString("base64"),
		authTag: authTag.toString("base64"),
	};
}

export function encryptLlmCredentials(
	input?: LlmCredentialInput | null,
): StoredLlmCredentials | undefined {
	if (!input) return undefined;

	const output: StoredLlmCredentials = {};
	if (input.openaiApiKey?.trim()) {
		output.openai = encryptSecret(input.openaiApiKey.trim());
	}
	if (input.anthropicApiKey?.trim()) {
		output.anthropic = encryptSecret(input.anthropicApiKey.trim());
	}

	return Object.keys(output).length > 0 ? output : undefined;
}

export function maskConfiguredCredentials(credentials?: StoredLlmCredentials | null): {
	openai: boolean;
	anthropic: boolean;
} {
	return {
		openai: Boolean(credentials?.openai),
		anthropic: Boolean(credentials?.anthropic),
	};
}
