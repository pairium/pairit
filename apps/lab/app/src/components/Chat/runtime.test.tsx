import { describe, expect, it } from "vitest";
import { resolveChatGroupId } from "./runtime";

describe("resolveChatGroupId", () => {
	it("uses chat_group_id by default when matched", () => {
		expect(
			resolveChatGroupId({
				pageId: "discussion",
				sessionId: "sess-1",
				sessionState: { chat_group_id: "group-abc" },
			}),
		).toBe("group-abc");
	});

	it("uses chat_group_id when scope is explicitly group", () => {
		expect(
			resolveChatGroupId({
				scope: "group",
				groupId: "ai_coach",
				pageId: "discussion",
				sessionId: "sess-1",
				sessionState: { chat_group_id: "group-abc" },
			}),
		).toBe("group-abc");
	});

	it("ignores chat_group_id when scope is participant", () => {
		expect(
			resolveChatGroupId({
				scope: "participant",
				pageId: "ai_chat",
				sessionId: "sess-1",
				sessionState: { chat_group_id: "group-abc" },
			}),
		).toBe("sess-1:ai_chat");
	});

	it("combines scope: participant with an explicit groupId for cross-page private chats", () => {
		expect(
			resolveChatGroupId({
				scope: "participant",
				groupId: "claude_coach",
				pageId: "round_2",
				sessionId: "sess-1",
				sessionState: { chat_group_id: "group-abc" },
			}),
		).toBe("sess-1:claude_coach");
	});

	it("returns null for participant scope before sessionId is ready", () => {
		expect(
			resolveChatGroupId({
				scope: "participant",
				pageId: "ai_chat",
				sessionId: null,
				sessionState: { chat_group_id: "group-abc" },
			}),
		).toBeNull();
	});

	it("falls back to explicit groupId when unmatched", () => {
		expect(
			resolveChatGroupId({
				groupId: "main",
				pageId: "chat_1",
				sessionId: "sess-1",
				sessionState: {},
			}),
		).toBe("sess-1:main");
	});

	it("returns null when unmatched and no explicit groupId (so async check runs)", () => {
		expect(
			resolveChatGroupId({
				pageId: "chat_1",
				sessionId: "sess-1",
				sessionState: {},
			}),
		).toBeNull();
	});
});
