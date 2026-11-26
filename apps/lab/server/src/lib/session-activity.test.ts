import { beforeEach, describe, expect, test } from "bun:test";
import {
	resetActivityTouchCache,
	shouldTouchSessionActivity,
} from "./session-activity";

describe("shouldTouchSessionActivity", () => {
	beforeEach(() => {
		resetActivityTouchCache();
	});

	test("throttles repeated touches within the interval and allows after expiry", () => {
		expect(shouldTouchSessionActivity("s1", 1_000, 60_000)).toBe(true);
		expect(shouldTouchSessionActivity("s1", 10_000, 60_000)).toBe(false);
		expect(shouldTouchSessionActivity("s1", 60_999, 60_000)).toBe(false);
		expect(shouldTouchSessionActivity("s1", 61_000, 60_000)).toBe(true);
	});

	test("tracks sessions independently", () => {
		expect(shouldTouchSessionActivity("s1", 1_000, 60_000)).toBe(true);
		expect(shouldTouchSessionActivity("s2", 1_000, 60_000)).toBe(true);
		expect(shouldTouchSessionActivity("s1", 2_000, 60_000)).toBe(false);
	});

	test("evicts oldest session when cache exceeds maxEntries", () => {
		expect(shouldTouchSessionActivity("s1", 1_000, 60_000, 2)).toBe(true);
		expect(shouldTouchSessionActivity("s2", 2_000, 60_000, 2)).toBe(true);
		// Adding s3 evicts s1
		expect(shouldTouchSessionActivity("s3", 3_000, 60_000, 2)).toBe(true);
		// s1 was evicted so it touches again; s2 is still cached
		expect(shouldTouchSessionActivity("s2", 4_000, 60_000, 2)).toBe(false);
		expect(shouldTouchSessionActivity("s1", 4_000, 60_000, 2)).toBe(true);
	});
});
