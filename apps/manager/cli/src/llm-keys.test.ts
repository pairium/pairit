import { describe, expect, test } from "bun:test";
import { type LlmKeyOptions, resolveLlmKeys } from "./llm-keys";

function resolve(
	options: LlmKeyOptions,
	env: Record<string, string> = {},
	stdin = "",
) {
	return resolveLlmKeys(options, { env, readStdin: async () => stdin });
}

describe("resolveLlmKeys", () => {
	test("nothing passed changes nothing", async () => {
		expect(await resolve({})).toEqual({
			llmCredentials: {},
			clearLlmCredentials: [],
		});
	});

	test("reads a key from a flag, an env var or stdin", async () => {
		expect(await resolve({ openaiApiKey: " sk-a " })).toMatchObject({
			llmCredentials: { openaiApiKey: "sk-a" },
		});
		expect(
			await resolve({ anthropicApiKeyEnv: "MY_KEY" }, { MY_KEY: "sk-ant" }),
		).toMatchObject({ llmCredentials: { anthropicApiKey: "sk-ant" } });
		expect(
			await resolve({ openaiApiKeyStdin: true }, {}, "sk-stdin\n"),
		).toMatchObject({ llmCredentials: { openaiApiKey: "sk-stdin" } });
	});

	test("clears a provider without touching the other", async () => {
		expect(
			await resolve({ clearAnthropicApiKey: true, openaiApiKey: "sk" }),
		).toEqual({
			llmCredentials: { openaiApiKey: "sk" },
			clearLlmCredentials: ["anthropic"],
		});
	});

	test.each([
		[{ openaiApiKey: "a", openaiApiKeyEnv: "X" }, "one way"],
		[{ openaiApiKey: "a", clearOpenaiApiKey: true }, "can't be combined"],
		[{ openaiApiKeyEnv: "MISSING" }, "empty or unset"],
		[{ openaiApiKeyStdin: true }, "No openai key on stdin"],
		[{ openaiApiKeyStdin: true, anthropicApiKeyStdin: true }, "Only one key"],
		[{ openaiApiKey: "  " }, "is empty"],
	] as const)("rejects %p", async (options, message) => {
		await expect(resolve(options)).rejects.toThrow(message);
	});
});
