import { describe, expect, test } from "bun:test";
import {
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
