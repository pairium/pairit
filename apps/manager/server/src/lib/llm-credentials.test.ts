import { describe, expect, test } from "bun:test";
import { rejectPublicCredentialsKey } from "./llm-credentials";

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
