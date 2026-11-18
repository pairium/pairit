import { describe, expect, test } from "bun:test";
import { assignStateRefusal } from "./agent-state";

const randomizedConfig = {
	pages: {
		intro: {
			id: "intro",
			components: [{ type: "randomization", props: { stateKey: "arm" } }],
		},
	},
};

describe("assignStateRefusal", () => {
	test("allows any other key when the config declares nothing", () => {
		expect(assignStateRefusal("mood", {})).toBeNull();
		expect(assignStateRefusal("notes.summary", {})).toBeNull();
	});

	test("refuses server-owned keys, under them and above them", () => {
		for (const path of [
			"chat_group_id",
			"group_id",
			"treatment",
			"chat.messages_sent",
			"chat_ended",
		]) {
			expect(assignStateRefusal(path, {})).toContain("set by Pairit");
		}
	});

	test("refuses a randomization's stateKey", () => {
		expect(assignStateRefusal("arm", randomizedConfig)).toContain(
			"set by Pairit",
		);
	});

	test("limits to the tool's path enum when it has one", () => {
		const tool = {
			parameters: {
				type: "object",
				properties: { path: { type: "string", enum: ["mood", "score"] } },
			},
		};
		expect(assignStateRefusal("mood", {}, tool)).toBeNull();
		expect(assignStateRefusal("other", {}, tool)).toContain("not one of");
		// The enum can't reopen a server-owned key
		const loose = {
			parameters: { properties: { path: { enum: ["chat_group_id"] } } },
		};
		expect(assignStateRefusal("chat_group_id", {}, loose)).toContain(
			"set by Pairit",
		);
	});

	test("limits to the session_state schema's keys when declared", () => {
		const config = { session_state: { mood: "string", answers: {} } };
		expect(assignStateRefusal("mood", config)).toBeNull();
		expect(assignStateRefusal("answers.q1", config)).toBeNull();
		expect(assignStateRefusal("endRedirectUrl", config)).toContain(
			"not declared",
		);
	});
});
