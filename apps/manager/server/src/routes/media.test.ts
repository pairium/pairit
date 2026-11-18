import {
	afterAll,
	beforeEach,
	describe,
	expect,
	mock,
	spyOn,
	test,
} from "bun:test";
import type { Elysia } from "elysia";

// Same stand-in as admin-activity.test.ts (bun shares module mocks across test
// files): x-test-role picks admin or researcher. x-test-user picks a
// researcher by id; "admin" is an admin.
mock.module("../lib/auth-middleware", () => ({
	authMiddleware: (app: Elysia) =>
		app.derive(({ request }) => {
			const id =
				request.headers.get("x-test-user") ??
				request.headers.get("x-test-role");
			if (!id) return { user: null, session: null, isAdmin: false };
			return {
				user: { id, email: `${id}@example.com` },
				session: null,
				isAdmin: id === "admin",
			};
		}),
}));
mock.module("../lib/auth", () => ({ auth: {} }));

const { storage } = await import("../lib/storage");
const { mediaRoutes } = await import("./media");

const objects = new Map<string, string | undefined>();
let signed: { key: string; options: unknown } | null = null;
const spies = [
	spyOn(storage, "put").mockImplementation(
		async (key: string, _data: unknown, options?: { contentType?: string }) => {
			objects.set(key, options?.contentType);
		},
	),
	spyOn(storage, "delete").mockImplementation(async (key: string) =>
		objects.delete(key),
	),
	spyOn(storage, "list").mockImplementation(async (prefix = "") =>
		[...objects.keys()].filter((key) => key.startsWith(prefix)),
	),
	spyOn(storage, "exists").mockImplementation(async (key: string) =>
		objects.has(key),
	),
	spyOn(storage, "getPublicUrl").mockImplementation(
		async (key: string) => `https://media.test/${key}`,
	),
	spyOn(storage, "getUploadUrl").mockImplementation(
		async (key: string, options: unknown) => {
			signed = { key, options };
			return { url: `https://upload.test/${key}`, method: "PUT", headers: {} };
		},
	),
];

afterAll(() => {
	for (const spy of spies) spy.mockRestore();
});

function call(
	user: string | null,
	method: string,
	path: string,
	body?: unknown,
): Promise<Response> {
	const headers: Record<string, string> = {};
	if (user) headers["x-test-user"] = user;
	if (body !== undefined) headers["content-type"] = "application/json";
	return mediaRoutes.handle(
		new Request(`http://localhost${path}`, {
			method,
			headers,
			body: body === undefined ? undefined : JSON.stringify(body),
		}),
	);
}

const png = Buffer.from("png").toString("base64");

beforeEach(() => {
	objects.clear();
	signed = null;
	objects.set("legacy.png", "image/png");
	objects.set("bob/photo.png", "image/png");
});

describe("media isolation", () => {
	test("uploads go under the uploader's prefix", async () => {
		const res = await call("alice", "POST", "/media/upload", {
			object: "photo.png",
			data: png,
		});
		expect(res.status).toBe(200);
		const json = (await res.json()) as { object: string; publicUrl: string };
		expect(json.object).toBe("alice/photo.png");
		expect(json.publicUrl).toBe("https://media.test/alice/photo.png");
		expect(objects.get("alice/photo.png")).toBe("image/png");
		expect(objects.has("photo.png")).toBe(false);
	});

	test("a researcher cannot overwrite another researcher's object", async () => {
		await call("alice", "POST", "/media/upload", {
			object: "bob/photo.png",
			data: png,
		});
		expect(objects.has("alice/bob/photo.png")).toBe(true);
		expect(objects.get("bob/photo.png")).toBe("image/png");
	});

	test("researchers list only their own objects; admins list all", async () => {
		objects.set("alice/a.png", "image/png");
		const mine = (await (await call("alice", "GET", "/media")).json()) as {
			objects: { name: string }[];
		};
		expect(mine.objects.map((o) => o.name)).toEqual(["alice/a.png"]);

		const all = (await (await call("admin", "GET", "/media")).json()) as {
			objects: { name: string }[];
		};
		expect(all.objects.map((o) => o.name).sort()).toEqual([
			"alice/a.png",
			"bob/photo.png",
			"legacy.png",
		]);
	});

	test("researchers cannot delete legacy or others' objects", async () => {
		const legacy = await call("alice", "DELETE", "/media/legacy.png");
		expect(legacy.status).toBe(403);
		const other = await call(
			"alice",
			"DELETE",
			`/media/${encodeURIComponent("bob/photo.png")}`,
		);
		expect(other.status).toBe(403);
		expect(objects.has("legacy.png")).toBe(true);
		expect(objects.has("bob/photo.png")).toBe(true);
	});

	test("researchers delete their own object by short or full name", async () => {
		objects.set("alice/a.png", "image/png");
		objects.set("alice/b.png", "image/png");
		expect((await call("alice", "DELETE", "/media/a.png")).status).toBe(200);
		expect(
			(
				await call(
					"alice",
					"DELETE",
					`/media/${encodeURIComponent("alice/b.png")}`,
				)
			).status,
		).toBe(200);
		expect(objects.has("alice/a.png")).toBe(false);
		expect(objects.has("alice/b.png")).toBe(false);
	});

	test("admins can delete legacy objects", async () => {
		expect((await call("admin", "DELETE", "/media/legacy.png")).status).toBe(
			200,
		);
		expect(objects.has("legacy.png")).toBe(false);
	});

	test("unauthenticated calls are rejected", async () => {
		expect((await call(null, "GET", "/media")).status).toBe(401);
	});
});

describe("media upload limits", () => {
	test("private uploads are refused", async () => {
		const res = await call("alice", "POST", "/media/upload", {
			object: "a.png",
			data: png,
			public: false,
		});
		expect(res.status).toBe(400);
		expect(((await res.json()) as { error: string }).error).toBe(
			"private_not_supported",
		);
	});

	test("path traversal and empty segments are refused", async () => {
		for (const object of ["../x.png", "a//b.png", "/abs.png", "a\\b.png"]) {
			const res = await call("alice", "POST", "/media/upload", {
				object,
				data: png,
			});
			expect(res.status).toBe(400);
		}
	});

	test("disallowed content types are refused", async () => {
		const res = await call("alice", "POST", "/media/upload-url", {
			object: "page.html",
			contentType: "text/html",
		});
		expect(res.status).toBe(400);
		expect(signed).toBeNull();
	});

	test("signed uploads are bounded in type, size, and lifetime", async () => {
		const res = await call("alice", "POST", "/media/upload-url", {
			object: "clip.mp4",
		});
		expect(res.status).toBe(200);
		expect(signed?.key).toBe("alice/clip.mp4");
		const options = signed?.options as {
			contentType: string;
			expiresInSeconds: number;
			maxBytes: number;
		};
		expect(options.contentType).toBe("video/mp4");
		expect(options.expiresInSeconds).toBe(900);
		expect(options.maxBytes).toBeGreaterThan(0);

		const unknown = await call("alice", "POST", "/media/upload-url", {
			object: "blob.xyz",
		});
		expect(unknown.status).toBe(200);
		expect((signed?.options as { contentType: string }).contentType).toBe(
			"application/octet-stream",
		);

		const tooLong = await call("alice", "POST", "/media/upload-url", {
			object: "clip.mp4",
			expiresInSeconds: 7 * 24 * 3600,
		});
		expect(tooLong.status).toBe(422);
	});
});
