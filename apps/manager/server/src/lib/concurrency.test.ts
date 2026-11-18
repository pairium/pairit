import { describe, expect, test } from "bun:test";
import { mapWithConcurrency } from "./concurrency";

describe("mapWithConcurrency", () => {
	test("keeps order and never exceeds the limit", async () => {
		let inFlight = 0;
		let peak = 0;
		const items = Array.from({ length: 50 }, (_, i) => i);
		const out = await mapWithConcurrency(items, 4, async (n) => {
			inFlight++;
			peak = Math.max(peak, inFlight);
			await new Promise((r) => setTimeout(r, Math.random() * 3));
			inFlight--;
			return n * 2;
		});
		expect(out).toEqual(items.map((n) => n * 2));
		expect(peak).toBeLessThanOrEqual(4);
	});

	test("handles an empty list", async () => {
		expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
	});

	test("rejects with the first error", async () => {
		await expect(
			mapWithConcurrency([1, 2, 3], 2, async (n) => {
				if (n === 2) throw new Error("bad");
				return n;
			}),
		).rejects.toThrow("bad");
	});
});
