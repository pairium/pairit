import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { decryptLlmSecret } from "@pairit/db/llm-credentials";
import {
	llmCredentialConflict,
	llmCredentialUpdateFields,
	newConfigLlmCredentials,
	planLlmCredentialChanges,
	rejectPublicCredentialsKey,
} from "./llm-credentials";

const previousKey = process.env.CREDENTIALS_ENCRYPTION_KEY;
beforeAll(() => {
	process.env.CREDENTIALS_ENCRYPTION_KEY = randomBytes(32).toString("hex");
});
afterAll(() => {
	if (previousKey === undefined) delete process.env.CREDENTIALS_ENCRYPTION_KEY;
	else process.env.CREDENTIALS_ENCRYPTION_KEY = previousKey;
});

describe("LLM credential changes", () => {
	test("setting one provider leaves the other untouched", () => {
		const { $set, $unset } = llmCredentialUpdateFields(
			planLlmCredentialChanges("cfg", { openaiApiKey: " sk-new " }, []),
		);
		expect(Object.keys($set)).toEqual(["llmCredentials.openai"]);
		expect($unset).toEqual({});
		const secret = $set["llmCredentials.openai"];
		expect(secret).toBeDefined();
		if (secret) {
			expect(
				decryptLlmSecret(secret, { configId: "cfg", provider: "openai" }),
			).toBe("sk-new");
		}
	});

	test("clearing removes only that provider", () => {
		const { $set, $unset } = llmCredentialUpdateFields(
			planLlmCredentialChanges("cfg", undefined, ["anthropic"]),
		);
		expect($set).toEqual({});
		expect($unset).toEqual({ "llmCredentials.anthropic": "" });
	});

	test("no keys and no clears change nothing", () => {
		const changes = planLlmCredentialChanges("cfg", {}, undefined);
		expect(llmCredentialUpdateFields(changes)).toEqual({
			$set: {},
			$unset: {},
		});
		expect(newConfigLlmCredentials(changes)).toBeUndefined();
	});

	test("new configs get only the keys sent", () => {
		const creds = newConfigLlmCredentials(
			planLlmCredentialChanges("cfg", { anthropicApiKey: "sk-ant" }, []),
		);
		expect(Object.keys(creds ?? {})).toEqual(["anthropic"]);
	});

	test("flags setting and clearing the same provider", () => {
		expect(llmCredentialConflict({ openaiApiKey: "sk" }, ["openai"])).toBe(
			"openai",
		);
		expect(llmCredentialConflict({ openaiApiKey: "sk" }, ["anthropic"])).toBe(
			null,
		);
	});
});

const EXAMPLE_KEY =
	"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("rejectPublicCredentialsKey", () => {
	test("production refuses the env.template key", () => {
		expect(() =>
			rejectPublicCredentialsKey({
				NODE_ENV: "production",
				CREDENTIALS_ENCRYPTION_KEY: EXAMPLE_KEY,
			}),
		).toThrow("public example value");
	});

	test("development allows it, and production allows a real key", () => {
		expect(() =>
			rejectPublicCredentialsKey({
				NODE_ENV: "development",
				CREDENTIALS_ENCRYPTION_KEY: EXAMPLE_KEY,
			}),
		).not.toThrow();
		expect(() =>
			rejectPublicCredentialsKey({
				NODE_ENV: "production",
				CREDENTIALS_ENCRYPTION_KEY: "ab".repeat(32),
			}),
		).not.toThrow();
	});
});
