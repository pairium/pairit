import { describe, expect, test } from "bun:test";
import { toChatHistory } from "./agent-runner";
import { promptMessages } from "./llm";

describe("toChatHistory", () => {
	test("leaves out system messages and maps senders to roles", () => {
		const history = toChatHistory([
			{
				senderType: "system",
				content: "Sorry, I encountered an error. Please try again.",
			},
			{ senderType: "participant", content: "what should we do" },
			{ senderType: "agent", content: "Let's compare answers." },
		]);
		expect(history).toEqual([
			{ role: "user", content: "what should we do" },
			{ role: "assistant", content: "Let's compare answers." },
		]);
	});
});

describe("promptMessages", () => {
	test("gives an opening agent one message to answer", () => {
		const messages = promptMessages([]);
		expect(messages).toHaveLength(1);
		expect(messages[0]?.role).toBe("user");
	});

	test("keeps an existing history as is", () => {
		const history = [{ role: "user" as const, content: "hi" }];
		expect(promptMessages(history)).toBe(history);
	});
});
