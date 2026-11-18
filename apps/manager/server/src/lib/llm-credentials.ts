import { encryptLlmSecret, type LlmProvider } from "@pairit/db/llm-credentials";
import type { EncryptedSecret } from "@pairit/db/types";

export type { LlmProvider };

export const LLM_PROVIDERS: readonly LlmProvider[] = ["openai", "anthropic"];

export type LlmCredentialInput = {
	openaiApiKey?: string;
	anthropicApiKey?: string;
};

export type StoredLlmCredentials = {
	openai?: EncryptedSecret;
	anthropic?: EncryptedSecret;
};

/** The example key committed in env.template. Production must refuse it. */
const PUBLIC_CREDENTIALS_KEYS: ReadonlySet<string> = new Set([
	"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
]);

/**
 * Throws in production when CREDENTIALS_ENCRYPTION_KEY is the public example
 * value. The manager calls this at startup so a bad deploy fails to start.
 */
export function rejectPublicCredentialsKey(
	env: Record<string, string | undefined> = process.env,
): void {
	if (env.NODE_ENV !== "production") return;
	const raw = env.CREDENTIALS_ENCRYPTION_KEY?.trim().toLowerCase();
	if (raw && PUBLIC_CREDENTIALS_KEYS.has(raw)) {
		throw new Error(
			"CREDENTIALS_ENCRYPTION_KEY is the public example value from env.template. Generate one with: openssl rand -hex 32",
		);
	}
}

const INPUT_FIELD: Record<LlmProvider, keyof LlmCredentialInput> = {
	openai: "openaiApiKey",
	anthropic: "anthropicApiKey",
};

function inputKey(
	input: LlmCredentialInput | null | undefined,
	provider: LlmProvider,
): string | undefined {
	return input?.[INPUT_FIELD[provider]]?.trim() || undefined;
}

/** A provider the upload both sets and clears, if any. */
export function llmCredentialConflict(
	input: LlmCredentialInput | null | undefined,
	clear: readonly LlmProvider[] | null | undefined,
): LlmProvider | null {
	return (
		LLM_PROVIDERS.find((p) => inputKey(input, p) && clear?.includes(p)) ?? null
	);
}

/**
 * What an upload does to stored keys, per provider: set the ones it sends,
 * clear the ones it asks to clear, and leave the rest alone.
 */
export type LlmCredentialChanges = {
	set: Partial<Record<LlmProvider, EncryptedSecret>>;
	clear: LlmProvider[];
};

export function planLlmCredentialChanges(
	configId: string,
	input: LlmCredentialInput | null | undefined,
	clear: readonly LlmProvider[] | null | undefined,
): LlmCredentialChanges {
	const changes: LlmCredentialChanges = { set: {}, clear: [] };
	for (const provider of LLM_PROVIDERS) {
		const value = inputKey(input, provider);
		if (value) {
			changes.set[provider] = encryptLlmSecret(value, { configId, provider });
		} else if (clear?.includes(provider)) {
			changes.clear.push(provider);
		}
	}
	return changes;
}

/** Mongo `$set` / `$unset` fields that apply the changes to a config doc. */
export function llmCredentialUpdateFields(changes: LlmCredentialChanges): {
	$set: Record<string, EncryptedSecret>;
	$unset: Record<string, "">;
} {
	const $set: Record<string, EncryptedSecret> = {};
	for (const [provider, secret] of Object.entries(changes.set)) {
		if (secret) $set[`llmCredentials.${provider}`] = secret;
	}
	const $unset: Record<string, ""> = {};
	for (const provider of changes.clear) {
		$unset[`llmCredentials.${provider}`] = "";
	}
	return { $set, $unset };
}

/** Credentials for a brand-new config doc, or undefined when none are set. */
export function newConfigLlmCredentials(
	changes: LlmCredentialChanges,
): StoredLlmCredentials | undefined {
	return Object.keys(changes.set).length > 0 ? { ...changes.set } : undefined;
}

export function maskConfiguredCredentials(
	credentials?: StoredLlmCredentials | null,
): {
	openai: boolean;
	anthropic: boolean;
} {
	return {
		openai: Boolean(credentials?.openai),
		anthropic: Boolean(credentials?.anthropic),
	};
}
