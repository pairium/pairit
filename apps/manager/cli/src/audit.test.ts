import { describe, expect, test } from "bun:test";
import {
	type AuditSession,
	auditData,
	filterSessions,
	requiredSurveyItems,
} from "./audit";

function session(overrides: Partial<AuditSession> = {}): AuditSession {
	return {
		sessionId: "s1",
		currentPageId: "end",
		status: "completed",
		session_state: {},
		prolific: { prolificPid: "bot_qa_1" },
		configRevision: 3,
		createdAt: "2026-11-23T10:00:00.000Z",
		updatedAt: "2026-11-23T10:05:00.000Z",
		...overrides,
	};
}

const config = {
	pages: [
		{
			id: "post",
			components: [
				{
					type: "survey",
					props: {
						items: [
							{ id: "age", text: "Age", answer: "numeric" },
							{ id: "notes", text: "Notes", answer: "text", required: false },
							{
								id: "comments",
								text: "Comments",
								answer: { type: "text", required: false },
							},
						],
					},
				},
			],
		},
	],
};

describe("requiredSurveyItems", () => {
	test("items are required unless they opt out", () => {
		expect(requiredSurveyItems(config)).toEqual(new Map([["post", ["age"]]]));
	});
});

describe("filterSessions", () => {
	test("filters by PID prefix and start time", () => {
		const sessions = [
			session({ sessionId: "a" }),
			session({ sessionId: "b", prolific: { prolificPid: "real_1" } }),
			session({ sessionId: "c", createdAt: "2026-11-22T00:00:00.000Z" }),
			session({ sessionId: "d", prolific: null }),
		];
		const kept = filterSessions(sessions, {
			pidPrefix: "bot_qa_",
			since: "2026-11-23T00:00:00Z",
		});
		expect(kept.map((s) => s.sessionId)).toEqual(["a"]);
	});
});

describe("auditData", () => {
	test("a clean run has no errors or warnings", () => {
		const result = auditData({
			sessions: [session({ session_state: { age: 30 } })],
			groups: [],
			surveyResponses: [
				{
					sessionId: "s1",
					pageId: "post",
					componentId: "c",
					data: { age: 30 },
				},
			],
			config,
			requireState: ["age"],
		});
		expect(result).toEqual({
			sessions: 1,
			completed: 1,
			errors: [],
			warnings: [],
		});
	});

	test("flags unfinished sessions with the page they stopped on", () => {
		const result = auditData({
			sessions: [session({ status: "in_progress", currentPageId: "lobby" })],
			groups: [],
			surveyResponses: [],
		});
		expect(result.completed).toBe(0);
		expect(result.errors[0]).toContain('stopped on page "lobby"');
	});

	test("flags required answers that were not saved, not optional ones", () => {
		const result = auditData({
			sessions: [session()],
			groups: [],
			surveyResponses: [
				{
					sessionId: "s1",
					pageId: "post",
					componentId: "c",
					data: { age: "" },
				},
			],
			config,
		});
		expect(result.errors).toEqual([
			's1 (bot_qa_1) page "post": required answers not saved: age',
		]);
	});

	test("flags missing analysis variables, including dotted paths", () => {
		const result = auditData({
			sessions: [session({ session_state: { chat: { sent: 2 } } })],
			groups: [],
			surveyResponses: [],
			requireState: ["chat.sent", "choice"],
		});
		expect(result.errors).toEqual([
			"s1 (bot_qa_1) has no session_state.choice",
		]);
	});

	test("warns about partial groups and mixed revisions", () => {
		const result = auditData({
			sessions: [
				session({ sessionId: "a" }),
				session({ sessionId: "b", status: "in_progress", configRevision: 4 }),
			],
			groups: [
				{ groupId: "g1", sessionId: "a" },
				{ groupId: "g1", sessionId: "b" },
			],
			surveyResponses: [],
		});
		expect(result.warnings).toEqual([
			"group g1: 1 of 2 members finished",
			"sessions span config revisions 3, 4; narrow with --since",
		]);
	});
});
