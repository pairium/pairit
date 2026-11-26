import { describe, expect, test } from "bun:test";
import { lintChats } from "./chat-lint";

describe("lintChats", () => {
	test("accepts omitted, participant, and group scope", () => {
		expect(
			lintChats({
				pages: [
					{
						id: "p1",
						components: [
							{ type: "chat", props: { agents: ["claude"] } },
							{
								type: "chat",
								props: { scope: "participant", agents: ["claude"] },
							},
						],
					},
					{
						id: "p2",
						components: [{ type: "chat", props: { scope: "group" } }],
					},
				],
			}),
		).toEqual([]);
	});

	test("accepts two participant chats on the same page with distinct groupId props", () => {
		expect(
			lintChats({
				pages: [
					{
						id: "split",
						components: [
							{
								type: "chat",
								props: { scope: "participant", groupId: "coach" },
							},
							{
								type: "chat",
								props: { scope: "participant", groupId: "critic" },
							},
						],
					},
				],
			}),
		).toEqual([]);
	});

	test("rejects duplicate participant chats without distinct groupId", () => {
		expect(
			lintChats({
				pages: [
					{
						id: "split",
						components: [
							{ type: "chat", props: { scope: "participant" } },
							{ type: "chat", props: { scope: "participant" } },
						],
					},
				],
			}),
		).toEqual([
			'split.components[1]: duplicate chat room on page "split" (same as split.components[0]); set distinct groupId props (and scope: "participant" for private chats)',
		]);
	});

	test("rejects duplicate group chats on the same page", () => {
		expect(
			lintChats({
				pages: [
					{
						id: "team",
						components: [
							{ type: "chat", props: {} },
							{ type: "chat", props: { scope: "group" } },
						],
					},
				],
			}),
		).toEqual([
			'team.components[1]: duplicate chat room on page "team" (same as team.components[0]); set distinct groupId props (and scope: "participant" for private chats)',
		]);
	});

	test("allows conditionally rendered chats with `when` on the same page", () => {
		expect(
			lintChats({
				pages: [
					{
						id: "cond",
						components: [
							{
								type: "chat",
								when: { path: "condition", equals: "ai" },
								props: { scope: "participant", agents: ["claude"] },
							},
							{
								type: "chat",
								when: { path: "condition", equals: "control" },
								props: { scope: "participant" },
							},
						],
					},
				],
			}),
		).toEqual([]);
	});

	test("rejects invalid scope values", () => {
		expect(
			lintChats({
				pages: [
					{
						id: "ai_chat",
						components: [{ type: "chat", props: { scope: "session" } }],
					},
				],
			}),
		).toEqual([
			'ai_chat.components[0]: chat scope must be "participant" or "group"',
		]);
	});
});
