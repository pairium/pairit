import { describe, expect, test } from "bun:test";
import {
	MAX_RUNS_PER_SESSION,
	toChatHistory,
	withGroupRunLock,
} from "./agent-runner";
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

describe("withGroupRunLock", () => {
	test("one run per group, and a session's runs are capped across groups", async () => {
		let release = () => {};
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		const running = Array.from({ length: MAX_RUNS_PER_SESSION }, (_, i) =>
			withGroupRunLock(`s1:g${i}`, "s1", () => held),
		);

		// The same group from another session: taken
		expect(await withGroupRunLock("s1:g0", "s2", async () => {})).toBe(false);
		// Another group from the same session: over the session's cap
		expect(await withGroupRunLock("s1:other", "s1", async () => {})).toBe(
			false,
		);
		// Another session is unaffected
		expect(await withGroupRunLock("s3:g", "s3", async () => {})).toBe(true);

		release();
		expect(await Promise.all(running)).toEqual(
			Array(MAX_RUNS_PER_SESSION).fill(true),
		);
		expect(await withGroupRunLock("s1:other", "s1", async () => {})).toBe(true);
	});
});
