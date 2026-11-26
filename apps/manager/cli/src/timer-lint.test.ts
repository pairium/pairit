import { describe, expect, test } from "bun:test";
import { lintTimers } from "./timer-lint";

describe("lintTimers", () => {
	test("accepts valid session, group, and shared-key timers", () => {
		expect(
			lintTimers({
				pages: [
					{
						id: "draft_a",
						components: [
							{
								type: "timer",
								props: { duration: 900, scope: "group", key: "draft_phase" },
							},
						],
					},
					{
						id: "draft_b",
						components: [
							{
								type: "timer",
								props: { duration: 900, scope: "group", key: "draft_phase" },
							},
						],
					},
					{
						id: "solo",
						components: [
							{ type: "timer", props: { duration: 60, scope: "session" } },
						],
					},
				],
			}),
		).toEqual([]);
	});

	test("rejects invalid scope values", () => {
		expect(
			lintTimers({
				pages: [
					{
						id: "p1",
						components: [
							{ type: "timer", props: { duration: 60, scope: "team" } },
						],
					},
				],
			}),
		).toEqual(['p1.components[0]: timer scope must be "session" or "group"']);
	});

	test("rejects invalid timer keys", () => {
		expect(
			lintTimers({
				pages: [
					{
						id: "p1",
						components: [
							{ type: "timer", props: { duration: 60, key: "bad key!" } },
						],
					},
				],
			}),
		).toEqual([
			"p1.components[0]: timer key must be a non-empty string of letters, numbers, hyphens, or underscores",
		]);
	});

	test("flags conflicting scope or duration on timers sharing a key", () => {
		expect(
			lintTimers({
				pages: [
					{
						id: "p1",
						components: [
							{
								type: "timer",
								props: { duration: 300, scope: "group", key: "phase_1" },
							},
						],
					},
					{
						id: "p2",
						components: [
							{
								type: "timer",
								props: { duration: 600, scope: "session", key: "phase_1" },
							},
						],
					},
				],
			}),
		).toEqual([
			'p2.components[0]: timer key "phase_1" uses scope "session", which conflicts with p1.components[0] ("group")',
			'p2.components[0]: timer key "phase_1" has duration 600, which conflicts with p1.components[0] (300)',
		]);
	});
});
