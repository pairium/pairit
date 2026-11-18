import { decryptLlmSecret } from "@pairit/db/llm-credentials";
import type { ConfigLlmCredentials } from "@pairit/db/types";
import { getConfigsCollection } from "./db";

export type ResolvedLlmCredentials = {
	openaiApiKey?: string;
	anthropicApiKey?: string;
};

/**
 * Credentials come from the live `configs` doc, unlike agents and pages, which
 * come from the config the session started on. They are stored encrypted on
 * the config doc only and are never copied into sessions or config_revisions,
 * so a rotated or removed key takes effect for sessions already in progress.
 */
export async function getLlmCredentialsForConfig(
	configId: string,
): Promise<ResolvedLlmCredentials> {
	const collection = await getConfigsCollection();
	const doc = await collection.findOne(
		{ configId },
		{ projection: { llmCredentials: 1 } },
	);
	const stored = doc?.llmCredentials as ConfigLlmCredentials | undefined;

	return {
		openaiApiKey: stored?.openai
			? decryptLlmSecret(stored.openai, { configId, provider: "openai" })
			: undefined,
		anthropicApiKey: stored?.anthropic
			? decryptLlmSecret(stored.anthropic, { configId, provider: "anthropic" })
			: undefined,
	};
}
