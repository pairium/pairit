import { describe, expect, test } from "bun:test";
import {
	getEffectiveBalanceKey,
	sessionBalanceFilter,
} from "./treatment-assignment";

describe("treatment-assignment balance isolation", () => {
	test("live and simulated sessions use separate balance keys", () => {
		expect(getEffectiveBalanceKey("my-study:treatment")).toBe(
			"my-study:treatment",
		);
		expect(getEffectiveBalanceKey("my-study:treatment", true)).toBe(
			"my-study:treatment:sim",
		);
	});

	test("live rebuild excludes simulated sessions", () => {
		expect(sessionBalanceFilter(false)).toEqual({ simulated: { $ne: true } });
	});

	test("simulated rebuild only counts simulated sessions", () => {
		expect(sessionBalanceFilter(true)).toEqual({ simulated: true });
	});
});
