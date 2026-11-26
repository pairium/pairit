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
							{ type: "chat", props: { scope: "group" } },
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
