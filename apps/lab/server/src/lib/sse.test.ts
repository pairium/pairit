import { describe, expect, test } from "bun:test";
import {
	AsyncEventQueue,
	addConnection,
	getConnectionCount,
	MAX_CONNECTIONS_PER_SESSION,
	removeConnection,
	type SSEController,
} from "./sse";

function makeController() {
	const controller = { closed: false } as SSEController & { closed: boolean };
	controller.send = () => {};
	controller.close = () => {
		controller.closed = true;
	};
	return controller;
}

describe("SSE connections per session", () => {
	test("closes the oldest streams beyond the per-session limit", () => {
		const controllers = Array.from(
			{ length: MAX_CONNECTIONS_PER_SESSION + 2 },
			makeController,
		);
		for (const c of controllers) addConnection("sse-test", c);

		expect(getConnectionCount("sse-test")).toBe(MAX_CONNECTIONS_PER_SESSION);
		expect(controllers.map((c) => c.closed)).toEqual([
			true,
			true,
			...Array(MAX_CONNECTIONS_PER_SESSION).fill(false),
		]);

		for (const c of controllers) removeConnection("sse-test", c);
		expect(getConnectionCount("sse-test")).toBe(0);
	});
});

describe("AsyncEventQueue", () => {
	test("closes instead of growing past its limit", async () => {
		const queue = new AsyncEventQueue(3);
		for (let i = 0; i < 3; i++) queue.push({ event: "e", data: i });
		expect(queue.isClosed()).toBe(false);
		queue.push({ event: "e", data: 3 });
		expect(queue.isClosed()).toBe(true);
		expect(await queue.pop()).toBeNull();
	});

	test("hands events straight to a waiting reader", async () => {
		const queue = new AsyncEventQueue(1);
		const next = queue.pop();
		queue.push({ event: "a", data: 1 });
		queue.push({ event: "b", data: 2 });
		expect(await next).toEqual({ event: "a", data: 1 });
		expect(queue.isClosed()).toBe(false);
	});
});
