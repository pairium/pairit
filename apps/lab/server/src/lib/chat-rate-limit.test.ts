import { afterEach, describe, expect, test } from "bun:test";
import {
	CHAT_PER_MINUTE,
	CHAT_PER_SESSION,
	resetChatRateLimits,
	takeChatSlot,
} from "./chat-rate-limit";

describe("takeChatSlot", () => {
	afterEach(resetChatRateLimits);

	test("allows up to the per-minute limit, then refuses", () => {
		const now = 1_000_000;
		for (let i = 0; i < CHAT_PER_MINUTE; i++) {
			expect(takeChatSlot("s", 0, now).ok).toBe(true);
		}
		expect(takeChatSlot("s", 0, now)).toEqual({
			ok: false,
			reason: "per_minute",
		});
		// Other sessions are unaffected
		expect(takeChatSlot("t", 0, now).ok).toBe(true);
		// The window slides
		expect(takeChatSlot("s", 0, now + 60_000).ok).toBe(true);
	});

	test("refuses past the per-session limit", () => {
		expect(takeChatSlot("s", CHAT_PER_SESSION)).toEqual({
			ok: false,
			reason: "per_session",
		});
	});
});
