import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Elysia } from "elysia";
import type { ActivityInput } from "../lib/activity";

// Stand-ins for Better Auth + the allowlist: the x-test-role header picks the
// caller, as authMiddleware would derive it.
mock.module("../lib/auth-middleware", () => ({
	authMiddleware: (app: Elysia) =>
		app.derive(({ request }) => {
			const role = request.headers.get("x-test-role");
			if (role !== "admin" && role !== "researcher") {
				return { user: null, session: null, isAdmin: false };
			}
			return {
				user: { id: role, email: `${role}@example.com` },
				session: null,
				isAdmin: role === "admin",
			};
		}),
}));
mock.module("../lib/auth", () => ({ auth: {} }));

let loadCalls: { since: Date; now: Date }[] = [];
mock.module("../lib/activity-db", () => ({
	loadActivityInput: async (since: Date, now: Date): Promise<ActivityInput> => {
		loadCalls.push({ since, now });
		return {
			now,
			since,
			lastActivity: new Map([["omh-test", now]]),
			configs: new Map([
				[
					"omh-test",
					{
						configId: "omh-test",
						name: "omh-test",
						owner: "owner-1",
						revision: 4,
						config: {
							pages: {
								wait: { id: "wait", components: [{ type: "matchmaking" }] },
								chat: { id: "chat", components: [{ type: "chat" }] },
							},
							matchmaking: [{ id: "pool" }],
						},
					},
				],
			]),
			ownerEmails: new Map([["owner-1", "owner@example.com"]]),
			activeSessions: [
				{
					configId: "omh-test",
					currentPageId: "chat",
					session_state: { chat_group_id: "g1" },
					config: undefined,
					createdAt: now,
				},
				{
					configId: "omh-test",
					currentPageId: "wait",
					session_state: {},
					config: undefined,
					createdAt: now,
				},
			],
			counts: new Map([
				["omh-test", { total: 127, startedToday: 5, prolific: 126 }],
			]),
		};
	},
}));

const { adminRoutes } = await import("./admin");

function get(path: string, role?: string) {
	const headers: Record<string, string> = role ? { "x-test-role": role } : {};
	return adminRoutes.handle(
		new Request(`http://localhost/admin${path}`, { headers }),
	);
}

describe("GET /admin/activity", () => {
	beforeEach(() => {
		loadCalls = [];
	});

	test("anonymous gets 401", async () => {
		const res = await get("/activity");
		expect(res.status).toBe(401);
		expect(loadCalls).toHaveLength(0);
	});

	test("a researcher who is not an admin gets 403", async () => {
		const res = await get("/activity", "researcher");
		expect(res.status).toBe(403);
		expect(loadCalls).toHaveLength(0);
	});

	test("an admin gets the report, live group studies included", async () => {
		const res = await get("/activity", "admin");
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.liveGroupStudies).toHaveLength(1);
		expect(body.liveGroupStudies[0]).toMatchObject({
			configId: "omh-test",
			ownerEmail: "owner@example.com",
			activeNow: { total: 2, inGroup: 1, solo: 1 },
			waitingInMatchmaking: 1,
			totalSessions: 127,
			prolificSessions: 126,
			isGroupStudy: true,
		});
		// Defaults to the last 24 hours
		const { since, now } = loadCalls[0];
		expect(now.getTime() - since.getTime()).toBe(24 * 60 * 60 * 1000);
	});

	test("since narrows the window", async () => {
		const res = await get("/activity?since=2026-10-01T00:00:00Z", "admin");
		expect(res.status).toBe(200);
		expect(loadCalls[0].since.toISOString()).toBe("2026-10-01T00:00:00.000Z");
	});

	test("a bad since is a 400", async () => {
		expect((await get("/activity?since=yesterday", "admin")).status).toBe(400);
		expect((await get("/activity?since=2999-01-01", "admin")).status).toBe(400);
	});
});
