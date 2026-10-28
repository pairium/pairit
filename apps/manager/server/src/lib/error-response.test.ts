import { describe, expect, test } from "bun:test";
import { Elysia, t } from "elysia";
import { errorResponse, errorStatus } from "./error-response";

const app = new Elysia()
	.onError(errorResponse)
	.get("/boom", () => {
		throw new Error("boom");
	})
	.post("/echo", ({ body }) => body, {
		body: t.Object({ name: t.String() }),
	});

function request(path: string, init?: RequestInit) {
	return app.handle(new Request(`http://localhost${path}`, init));
}

describe("errorStatus", () => {
	test("keeps a status an error carries", () => {
		expect(errorStatus({ status: 404 })).toBe(404);
	});

	test("falls back to 500", () => {
		expect(errorStatus(new Error("boom"))).toBe(500);
		expect(errorStatus({ status: 200 })).toBe(500);
		expect(errorStatus("boom")).toBe(500);
	});
});

describe("errorResponse", () => {
	test("returns 404 for an unknown route", async () => {
		const res = await request("/health");
		expect(res.status).toBe(404);
		expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
	});

	test("returns 422 for a body that fails validation", async () => {
		const res = await request("/echo", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: 1 }),
		});
		expect(res.status).toBe(422);
		expect(await res.json()).toMatchObject({ code: "VALIDATION" });
	});

	test("returns 500 for a thrown error", async () => {
		const res = await request("/boom");
		expect(res.status).toBe(500);
		expect(await res.json()).toMatchObject({ message: "boom" });
	});
});
