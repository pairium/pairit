import { afterEach, describe, expect, test } from "bun:test";
import {
	enqueueSession,
	getPoolStatus,
	handleDisconnect,
	removeSession,
} from "./matchmaking-pool";
import { addConnection, removeConnection, type SSEController } from "./sse";

const poolConfig = { numUsers: 3, timeoutSeconds: 60 };
const controller: SSEController = { send: () => {}, close: () => {} };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("matchmaking disconnect grace period", () => {
	afterEach(() => {
		removeSession("s1");
		removeConnection("s1", controller);
	});

	test("keeps a session that reconnects within the grace period", async () => {
		await enqueueSession("s1", "cfg", "pool", poolConfig);
		handleDisconnect("s1", 20);
		addConnection("s1", controller);
		await sleep(40);
		expect(getPoolStatus()["cfg:pool"]?.sessions).toEqual(["s1"]);
	});

	test("removes a session that stays disconnected", async () => {
		await enqueueSession("s1", "cfg", "pool", poolConfig);
		handleDisconnect("s1", 20);
		expect(getPoolStatus()["cfg:pool"]?.sessions).toEqual(["s1"]);
		await sleep(40);
		expect(getPoolStatus()["cfg:pool"]).toBeUndefined();
	});
});
