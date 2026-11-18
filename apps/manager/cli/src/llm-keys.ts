export type LlmProvider = "openai" | "anthropic";

export type LlmKeyOptions = {
	openaiApiKey?: string;
	openaiApiKeyEnv?: string;
	openaiApiKeyStdin?: boolean;
	clearOpenaiApiKey?: boolean;
	anthropicApiKey?: string;
	anthropicApiKeyEnv?: string;
	anthropicApiKeyStdin?: boolean;
	clearAnthropicApiKey?: boolean;
};

export type ResolvedLlmKeys = {
	llmCredentials: { openaiApiKey?: string; anthropicApiKey?: string };
	clearLlmCredentials: LlmProvider[];
};

const PROVIDERS = [
	{
		provider: "openai",
		flag: "openai-api-key",
		field: "openaiApiKey",
		value: (o: LlmKeyOptions) => o.openaiApiKey,
		env: (o: LlmKeyOptions) => o.openaiApiKeyEnv,
		stdin: (o: LlmKeyOptions) => o.openaiApiKeyStdin,
		clear: (o: LlmKeyOptions) => o.clearOpenaiApiKey,
	},
	{
		provider: "anthropic",
		flag: "anthropic-api-key",
		field: "anthropicApiKey",
		value: (o: LlmKeyOptions) => o.anthropicApiKey,
		env: (o: LlmKeyOptions) => o.anthropicApiKeyEnv,
		stdin: (o: LlmKeyOptions) => o.anthropicApiKeyStdin,
		clear: (o: LlmKeyOptions) => o.clearAnthropicApiKey,
	},
] as const;

/**
 * Work out which LLM keys an upload sets or clears. A key can come from a
 * flag, an environment variable (`--openai-api-key-env VAR`), or stdin
 * (`--openai-api-key-stdin`); the last two keep it out of `ps` and shell
 * history. Keys not mentioned are left as stored.
 */
export async function resolveLlmKeys(
	options: LlmKeyOptions,
	io: {
		env: Record<string, string | undefined>;
		readStdin: () => Promise<string>;
	},
): Promise<ResolvedLlmKeys> {
	const stdinUsers = PROVIDERS.filter((p) => p.stdin(options));
	if (stdinUsers.length > 1) {
		throw new Error(
			"Only one key can come from stdin. Use --<provider>-api-key-env for the other.",
		);
	}

	const result: ResolvedLlmKeys = {
		llmCredentials: {},
		clearLlmCredentials: [],
	};
	for (const p of PROVIDERS) {
		const sources = [
			p.value(options) !== undefined,
			p.env(options) !== undefined,
			Boolean(p.stdin(options)),
		].filter(Boolean).length;
		if (sources > 1) {
			throw new Error(
				`Pass the ${p.provider} key one way: --${p.flag}, --${p.flag}-env or --${p.flag}-stdin.`,
			);
		}
		if (sources > 0 && p.clear(options)) {
			throw new Error(`--clear-${p.flag} can't be combined with a new key.`);
		}

		let key: string | undefined;
		const envName = p.env(options);
		if (p.value(options) !== undefined) {
			key = p.value(options);
		} else if (envName !== undefined) {
			key = io.env[envName];
			if (!key?.trim()) {
				throw new Error(`Environment variable ${envName} is empty or unset.`);
			}
		} else if (p.stdin(options)) {
			key = await io.readStdin();
			if (!key.trim()) throw new Error(`No ${p.provider} key on stdin.`);
		}

		if (key !== undefined) {
			const trimmed = key.trim();
			if (!trimmed) throw new Error(`--${p.flag} is empty.`);
			result.llmCredentials[p.field] = trimmed;
		} else if (p.clear(options)) {
			result.clearLlmCredentials.push(p.provider);
		}
	}
	return result;
}

/** Read all of stdin (for `--<provider>-api-key-stdin`). */
export async function readAllStdin(): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) {
		chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
	}
	return Buffer.concat(chunks).toString("utf8");
}
