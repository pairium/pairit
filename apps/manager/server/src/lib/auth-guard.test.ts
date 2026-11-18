import { describe, expect, test } from "bun:test";
import type { Session, User } from "@pairit/auth";
import { Elysia } from "elysia";
import { createAuthMiddleware } from "./auth-guard";
import { isCsrfBlocked, normalizeOrigins } from "./csrf";

const API = "https://pairit-api.example.com";
const trusted = normalizeOrigins([API, "http://localhost:3002/"]);

let sessionLookups = 0;
const app = new Elysia()
	.use(
		createAuthMiddleware({
			getSession: async (headers) => {
				sessionLookups++;
				if (!(headers.get("cookie") ?? "").includes("session_token=good")) {
					return null;
				}
				return {
					user: { id: "u1", email: "r@example.com" } as User,
					session: { id: "s1" } as Session,
				};
			},
			findAllowed: async () => ({ isAdmin: false }),
			trustedOrigins: () => trusted,
		}),
	)
	.get("/configs", ({ user }) => ({ user: user?.id ?? null }))
	.post("/configs/upload", ({ user, set }) => {
		if (!user) {
			set.status = 401;
			return { error: "unauthorized" };
		}
		return { ok: true };
	});

const COOKIE = "better-auth.session_token=good.sig";

function post(headers: Record<string, string>) {
	return app.handle(
		new Request(`${API}/configs/upload`, { method: "POST", headers }),
	);
}

describe("isCsrfBlocked", () => {
	const req = (method: string, headers: Record<string, string>) =>
		new Request(`${API}/x`, { method, headers });

	test("never blocks safe methods", () => {
		expect(
			isCsrfBlocked(
				req("GET", { cookie: COOKIE, origin: "https://evil" }),
				trusted,
			),
		).toBe(false);
	});

	test("ignores requests without a session cookie", () => {
		expect(
			isCsrfBlocked(req("POST", { origin: "https://evil.com" }), trusted),
		).toBe(false);
	});

	test("matches the __Secure- cookie name too", () => {
		expect(
			isCsrfBlocked(
				req("DELETE", {
					cookie: "__Secure-better-auth.session_token=x",
					origin: "https://pairit.pairium.ai",
				}),
				trusted,
			),
		).toBe(true);
	});

	test.each([
		["trusted origin", { origin: API }, false],
		[
			"dev origin with trailing slash in config",
			{ origin: "http://localhost:3002" },
			false,
		],
		["sibling subdomain", { origin: "https://docs.example.com" }, true],
		["null origin", { origin: "null" }, true],
		["trusted referer", { referer: `${API}/login` }, false],
		["untrusted referer", { referer: "https://evil.com/x" }, true],
		["no origin or referer", {}, true],
	] as const)("%s", (_name, headers, blocked) => {
		expect(
			isCsrfBlocked(req("POST", { cookie: COOKIE, ...headers }), trusted),
		).toBe(blocked);
	});
});

describe("authMiddleware CSRF guard", () => {
	test("allows a cookie POST from the manager origin (the CLI)", async () => {
		const res = await post({ cookie: COOKIE, origin: API });
		expect(res.status).toBe(200);
	});

	test("refuses a cookie POST from another origin without a session lookup", async () => {
		const before = sessionLookups;
		const res = await post({ cookie: COOKIE, origin: "https://evil.com" });
		expect(res.status).toBe(403);
		expect(await res.json()).toMatchObject({ error: "forbidden_origin" });
		expect(sessionLookups).toBe(before);
	});

	test("refuses a cookie POST with no origin or referer", async () => {
		const res = await post({ cookie: COOKIE });
		expect(res.status).toBe(403);
	});

	test("anonymous POSTs still get 401, not 403", async () => {
		const res = await post({ origin: "https://evil.com" });
		expect(res.status).toBe(401);
	});

	test("GETs are not origin-checked", async () => {
		const res = await app.handle(
			new Request(`${API}/configs`, {
				headers: { cookie: COOKIE, origin: "https://evil.com" },
			}),
		);
		expect(await res.json()).toEqual({ user: "u1" });
	});
});
