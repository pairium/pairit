import { describe, expect, test } from "bun:test";
import {
	type ActivityReport,
	type ConfigActivity,
	formatActivity,
	parseDuration,
} from "./activity";

describe("parseDuration", () => {
	test("reads minutes, hours, days and weeks", () => {
		expect(parseDuration("30m")).toBe(30 * 60 * 1000);
		expect(parseDuration("2h")).toBe(2 * 60 * 60 * 1000);
		expect(parseDuration("7d")).toBe(7 * 24 * 60 * 60 * 1000);
		expect(parseDuration("1w")).toBe(7 * 24 * 60 * 60 * 1000);
	});

	test("rejects anything else", () => {
		for (const bad of ["", "2", "h", "0h", "-1d", "2 days", "1.5h"]) {
			expect(() => parseDuration(bad)).toThrow("Invalid duration");
		}
	});
});

function entry(overrides: Partial<ConfigActivity>): ConfigActivity {
	return {
		configId: "study",
		name: null,
		ownerId: "u1",
		ownerEmail: "r@example.com",
		revision: 1,
		updatedAt: null,
		lastActivityAt: null,
		activeNow: { total: 0, inGroup: 0, solo: 0 },
		waitingInMatchmaking: 0,
		startedToday: 0,
		totalSessions: 0,
		prolificSessions: 0,
		isGroupStudy: false,
		features: { chat: false, liveWorkspace: false, html: false, agents: false },
		...overrides,
	};
}

function report(configs: ConfigActivity[]): ActivityReport {
	return {
		generatedAt: "2026-10-27T12:00:00.000Z",
		since: "2026-10-26T12:00:00.000Z",
		activeWindowMinutes: 15,
		configs,
		liveGroupStudies: configs.filter(
			(c) => c.isGroupStudy && c.activeNow.total > 0,
		),
	};
}

describe("formatActivity", () => {
	test("puts live group studies first and marks them", () => {
		const text = formatActivity(
			report([
				entry({
					configId: "survey",
					activeNow: { total: 5, inGroup: 0, solo: 5 },
					features: {
						chat: false,
						liveWorkspace: false,
						html: true,
						agents: false,
					},
				}),
				entry({
					configId: "omh-test",
					ownerEmail: "owner@example.com",
					isGroupStudy: true,
					activeNow: { total: 3, inGroup: 2, solo: 1 },
					waitingInMatchmaking: 1,
					totalSessions: 127,
					features: {
						chat: true,
						liveWorkspace: true,
						html: false,
						agents: true,
					},
				}),
			]),
		);
		const lines = text.split("\n");
		expect(lines[0]).toBe("1 group study is live. Don't deploy production.");
		expect(lines[1]).toBe(
			"  omh-test (owner@example.com): 3 active (2 in a group, 1 solo), 1 waiting in matchmaking",
		);
		const header = lines.findIndex((line) => line.startsWith("  STUDY"));
		const rows = lines.slice(header + 1, header + 3);
		expect(rows[0]).toStartWith("● omh-test");
		expect(rows[0]).toContain("3 (2/1)");
		expect(rows[0]).toContain("group,chat,live-workspace,agents");
		expect(rows[1]).toStartWith("  survey");
		expect(rows[1]).toEndWith("html");
	});

	test("says so when nothing is live", () => {
		const text = formatActivity(report([]));
		expect(text).toContain("No group study is live.");
		expect(text).toContain("No sessions since 2026-10-26T12:00:00.000Z.");
	});

	test("names studies with stale open sessions", () => {
		const text = formatActivity({
			...report([entry({ configId: "group-study", staleOpen: 1 })]),
			staleAfterHours: 12,
		});
		expect(text).toContain(
			"Not counted: sessions that started over 12 h ago but still change, usually a tab left open: group-study (1).",
		);
		expect(text).toContain(
			"Active: not finished, changed in the last 15 min, and started in the last 12 h.",
		);
	});

	test("an idle group study is not live", () => {
		const text = formatActivity(
			report([entry({ configId: "idle", isGroupStudy: true })]),
		);
		expect(text).toContain("No group study is live.");
		expect(text).not.toContain("●");
	});
});
