import { describe, expect, test } from "bun:test";
import { MongoServerError } from "mongodb";
import {
	LOCK_TTL_MS,
	type StartLock,
	type StartLockStore,
	startLockKey,
	withStartLock,
} from "./session-start-lock";

/**
 * In-memory stand-in for the locks collection with a unique `key` index:
 * an upsert whose filter misses an existing key fails with E11000.
 */
function memoryStore() {
	const docs = new Map<string, StartLock>();
	const store = {
		async updateOne(
			filter: { key: string; expiresAt: { $lte: Date } },
			update: { $set: { token: string; expiresAt: Date } },
		) {
			const existing = docs.get(filter.key);
			if (existing && existing.expiresAt > filter.expiresAt.$lte) {
				throw new MongoServerError({ message: "E11000", code: 11000 });
			}
			docs.set(filter.key, { key: filter.key, ...update.$set });
			return { acknowledged: true };
		},
		async deleteOne(filter: { key: string; token: string }) {
			if (docs.get(filter.key)?.token === filter.token) {
				docs.delete(filter.key);
			}
			return { acknowledged: true };
		},
	};
	return { docs, store: store as unknown as StartLockStore };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe("startLockKey", () => {
	test("prefers the Prolific PID, then the user", () => {
		expect(startLockKey("c", { prolificPid: "p", userId: "u" })).toBe(
			"c:prolific:p",
		);
		expect(startLockKey("c", { prolificPid: null, userId: "u" })).toBe(
			"c:user:u",
		);
	});

	test("anonymous participants get no lock", () => {
		expect(startLockKey("c", { prolificPid: null, userId: null })).toBeNull();
	});
});

describe("withStartLock", () => {
	test("overlapping starts run one at a time and see each other's work", async () => {
		const { docs, store } = memoryStore();
		const sessions: string[] = [];
		// find-or-create, with a gap between the find and the create
		const start = (id: string) =>
			withStartLock(store, "c:prolific:a", async () => {
				const existing = sessions[0];
				await tick();
				if (existing) return existing;
				sessions.push(id);
				return id;
			});

		const results = await Promise.all([start("first"), start("second")]);
		expect(sessions).toEqual(["first"]);
		expect(results).toEqual(["first", "first"]);
		expect(docs.size).toBe(0);
	});

	test("different participants don't wait for each other", async () => {
		const { store } = memoryStore();
		const order: string[] = [];
		await Promise.all(
			["a", "b"].map((pid) =>
				withStartLock(store, `c:prolific:${pid}`, async () => {
					order.push(`${pid}-in`);
					await tick();
					order.push(`${pid}-out`);
				}),
			),
		);
		expect(order).toEqual(["a-in", "b-in", "a-out", "b-out"]);
	});

	test("releases the lock when fn throws", async () => {
		const { docs, store } = memoryStore();
		await expect(
			withStartLock(store, "k", async () => {
				throw new Error("boom");
			}),
		).rejects.toThrow("boom");
		expect(docs.size).toBe(0);
	});

	test("takes over an expired lock", async () => {
		const { docs, store } = memoryStore();
		docs.set("k", {
			key: "k",
			token: "crashed",
			expiresAt: new Date(Date.now() - 1),
		});
		expect(await withStartLock(store, "k", async () => "ran")).toBe("ran");
	});

	test("runs anyway once the wait is over", async () => {
		const { docs, store } = memoryStore();
		docs.set("k", {
			key: "k",
			token: "held",
			expiresAt: new Date(Date.now() + LOCK_TTL_MS),
		});
		const result = await withStartLock(store, "k", async () => "ran", {
			waitMs: 120,
		});
		expect(result).toBe("ran");
		// The other holder's lock is left alone
		expect(docs.get("k")?.token).toBe("held");
	});
});
