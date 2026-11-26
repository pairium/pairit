import { afterEach, describe, expect, test } from "bun:test";
import type { TimerDocument } from "../types";
import {
	cancelAllScheduledTimers,
	clearSessionPageTimers,
	computeTimerKey,
	startOrGetTimer,
	type TimerDeps,
} from "./timers";

function createTestDeps(options?: {
	now?: () => number;
	groupMembers?: Record<string, string[]>;
}) {
	const store = new Map<string, TimerDocument>();
	const broadcasts: Array<{ sessionId: string; event: string; data: unknown }> =
		[];
	const currentNow = options?.now ?? (() => Date.now());

	const deps: TimerDeps = {
		async claimTimer(doc) {
			const k = `${doc.scopeKey}::${doc.timerKey}`;
			const existing = store.get(k);
			if (existing) return existing;
			store.set(k, doc);
			return doc;
		},
		async deleteSessionPageTimers(sessionId, pageId) {
			const scopeKey = `session:${sessionId}`;
			const deleted: string[] = [];
			for (const [k, doc] of store.entries()) {
				if (doc.scopeKey === scopeKey && doc.pageId === pageId) {
					store.delete(k);
					deleted.push(doc.timerKey);
				}
			}
			return deleted;
		},
		async getGroupMembers(groupId) {
			return options?.groupMembers?.[groupId] ?? [];
		},
		broadcast(sessionId, event, data) {
			broadcasts.push({ sessionId, event, data });
		},
		now: currentNow,
	};

	return { deps, store, broadcasts };
}

afterEach(() => {
	cancelAllScheduledTimers();
});

describe("server timers", () => {
	test("session scope persists across reloads", async () => {
		let clock = 1_000_000;
		const { deps } = createTestDeps({ now: () => clock });
		const session = { id: "s1", configId: "cfg" };
		const settings = {
			componentId: "timer-0",
			duration: 60,
			scope: "session" as const,
		};

		const first = await startOrGetTimer(session, "draft", settings, deps);
		expect(first.startedAt).toBe(1_000_000);
		expect(first.expiresAt).toBe(1_060_000);
		expect(first.scope).toBe("session");

		// Participant refreshes 25s later: gets the same deadline
		clock += 25_000;
		const reloaded = await startOrGetTimer(session, "draft", settings, deps);
		expect(reloaded.startedAt).toBe(1_000_000);
		expect(reloaded.expiresAt).toBe(1_060_000);
		expect(reloaded.serverNow).toBe(1_025_000);
	});

	test("group scope shares the first arriver's deadline with teammates", async () => {
		let clock = 2_000_000;
		const { deps } = createTestDeps({
			now: () => clock,
			groupMembers: { g1: ["s1", "s2", "s3"] },
		});
		const settings = {
			componentId: "timer-0",
			duration: 900,
			scope: "group" as const,
		};

		const first = await startOrGetTimer(
			{ id: "s1", configId: "cfg", session_state: { group_id: "g1" } },
			"synthesis",
			settings,
			deps,
		);

		// Teammate arrives 30s later and receives the same expiresAt
		clock += 30_000;
		const second = await startOrGetTimer(
			{ id: "s2", configId: "cfg", session_state: { group_id: "g1" } },
			"synthesis",
			settings,
			deps,
		);

		expect(second.timerKey).toBe(first.timerKey);
		expect(second.startedAt).toBe(first.startedAt);
		expect(second.expiresAt).toBe(first.expiresAt);
		expect(second.expiresAt - second.serverNow).toBe(870_000);
	});

	test("group scope with key shares a deadline across different pages", async () => {
		let clock = 3_000_000;
		const { deps } = createTestDeps({
			now: () => clock,
			groupMembers: { g1: ["s1", "s2"] },
		});

		const roleA = await startOrGetTimer(
			{ id: "s1", configId: "cfg", session_state: { group_id: "g1" } },
			"draft_role_a",
			{ componentId: "timer-0", duration: 300, scope: "group", key: "draft" },
			deps,
		);

		clock += 10_000;
		const roleB = await startOrGetTimer(
			{ id: "s2", configId: "cfg", session_state: { group_id: "g1" } },
			"draft_role_b",
			{ componentId: "timer-0", duration: 300, scope: "group", key: "draft" },
			deps,
		);

		expect(roleA.timerKey).toBe("key:draft");
		expect(roleB.timerKey).toBe("key:draft");
		expect(roleB.expiresAt).toBe(roleA.expiresAt);
	});

	test("group scope falls back to session scope when no group_id exists", async () => {
		const { deps } = createTestDeps({ now: () => 4_000_000 });
		const res = await startOrGetTimer(
			{ id: "solo", configId: "cfg", session_state: {} },
			"draft",
			{ componentId: "timer-0", duration: 60, scope: "group" },
			deps,
		);
		expect(res.scope).toBe("session");
	});

	test("broadcasts timer_expired to all group members when deadline fires", async () => {
		const now = Date.now();
		const { deps, broadcasts } = createTestDeps({
			now: () => Date.now(),
			groupMembers: { g1: ["s1", "s2", "s3"] },
		});

		const res = await startOrGetTimer(
			{ id: "s1", configId: "cfg", session_state: { group_id: "g1" } },
			"synthesis",
			{ componentId: "timer-0", duration: 0.04, scope: "group" },
			deps,
		);
		expect(res.expiresAt).toBeGreaterThanOrEqual(now);

		await new Promise((r) => setTimeout(r, 90));

		expect(broadcasts).toEqual([
			{
				sessionId: "s1",
				event: "timer_expired",
				data: {
					timerKey: computeTimerKey("synthesis", "timer-0"),
					expiresAt: res.expiresAt,
				},
			},
			{
				sessionId: "s2",
				event: "timer_expired",
				data: {
					timerKey: computeTimerKey("synthesis", "timer-0"),
					expiresAt: res.expiresAt,
				},
			},
			{
				sessionId: "s3",
				event: "timer_expired",
				data: {
					timerKey: computeTimerKey("synthesis", "timer-0"),
					expiresAt: res.expiresAt,
				},
			},
		]);
	});

	test("clearSessionPageTimers clears unkeyed session timers and keeps keyed/group timers", async () => {
		const { deps, store, broadcasts } = createTestDeps({
			groupMembers: { g1: ["s1", "s2"] },
		});
		const session = {
			id: "s1",
			configId: "cfg",
			session_state: { group_id: "g1" },
		};

		await startOrGetTimer(
			session,
			"p1",
			{ componentId: "timer-0", duration: 0.05, scope: "session" },
			deps,
		);
		await startOrGetTimer(
			session,
			"p1",
			{
				componentId: "timer-1",
				duration: 60,
				scope: "session",
				key: "multi_page",
			},
			deps,
		);
		await startOrGetTimer(
			session,
			"p1",
			{ componentId: "timer-2", duration: 60, scope: "group" },
			deps,
		);

		expect(store.size).toBe(3);

		await clearSessionPageTimers("s1", "p1", deps);
		expect(store.size).toBe(2);
		expect(store.has("session:s1::page:p1:timer-0")).toBe(false);
		expect(store.has("session:s1::key:multi_page")).toBe(true);
		expect(store.has("group:g1::page:p1:timer-2")).toBe(true);

		// Cancelled broadcast should not fire
		await new Promise((r) => setTimeout(r, 80));
		expect(broadcasts).toEqual([]);
	});
});
