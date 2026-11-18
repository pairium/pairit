import { describe, expect, test } from "bun:test";
import { Elysia, t } from "elysia";
import { hideInternalErrors } from "./errors";

const plugin = new Elysia({ prefix: "/p" }).get("/boom", () => {
	throw new Error("connect ECONNREFUSED /secret/path");
});

const app = new Elysia()
	.use(hideInternalErrors)
	.use(plugin)
	.post("/typed", ({ body }) => body, {
		body: t.Object({ n: t.Number() }),
	});

describe("hideInternalErrors", () => {
	test("returns a generic 500 without the error message", async () => {
		const res = await app.handle(new Request("http://localhost/p/boom"));
		expect(res.status).toBe(500);
		const text = await res.text();
		expect(text).not.toContain("secret");
		expect(JSON.parse(text)).toEqual({ error: "internal_error" });
	});

	test("leaves validation errors alone", async () => {
		const res = await app.handle(
			new Request("http://localhost/typed", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ n: "no" }),
			}),
		);
		expect(res.status).toBe(422);
	});
});
