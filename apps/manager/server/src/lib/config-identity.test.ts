import { describe, expect, test } from "bun:test";
import {
	generateConfigId,
	nextRevision,
	revisionSessionFilter,
	slugifyName,
} from "./config-identity";

describe("slugifyName", () => {
	test("lowercases and joins words with dashes", () => {
		expect(slugifyName("My Trust Experiment")).toBe("my-trust-experiment");
	});

	test("collapses symbols and trims dashes", () => {
		expect(slugifyName("  --Trust__v2!!  ")).toBe("trust-v2");
	});

	test("caps length without a trailing dash", () => {
		const slug = slugifyName(`${"a".repeat(39)} b`);
		expect(slug.length).toBeLessThanOrEqual(40);
		expect(slug.endsWith("-")).toBe(false);
	});

	test("falls back when nothing is left", () => {
		expect(slugifyName("!!!")).toBe("config");
	});
});

describe("generateConfigId", () => {
	test("is the slug plus a 10-char suffix", () => {
		expect(generateConfigId("Trust Study")).toMatch(
			/^trust-study-[a-z0-9]{10}$/,
		);
	});

	test("differs between calls", () => {
		const ids = new Set(
			Array.from({ length: 100 }, () => generateConfigId("x")),
		);
		expect(ids.size).toBe(100);
	});
});

describe("revisionSessionFilter", () => {
	test("rev 1 includes sessions from before revisions", () => {
		expect(revisionSessionFilter(1)).toEqual({ $in: [1, null] });
	});

	test("later revisions match exactly", () => {
		expect(revisionSessionFilter(2)).toBe(2);
	});
});

describe("nextRevision", () => {
	test("first upload is revision 1", () => {
		expect(nextRevision(null, "abc")).toEqual({
			revision: 1,
			bumped: true,
			archiveLegacy: false,
		});
	});

	test("same checksum keeps the revision", () => {
		expect(nextRevision({ revision: 3, checksum: "abc" }, "abc")).toEqual({
			revision: 3,
			bumped: false,
			archiveLegacy: false,
		});
	});

	test("new checksum bumps the revision", () => {
		expect(nextRevision({ revision: 3, checksum: "abc" }, "def")).toEqual({
			revision: 4,
			bumped: true,
			archiveLegacy: false,
		});
	});

	test("legacy doc becomes rev 1 and a change becomes rev 2", () => {
		expect(nextRevision({ checksum: "abc" }, "def")).toEqual({
			revision: 2,
			bumped: true,
			archiveLegacy: true,
		});
	});

	test("legacy doc with the same checksum becomes rev 1", () => {
		expect(nextRevision({ checksum: "abc" }, "abc")).toEqual({
			revision: 1,
			bumped: false,
			archiveLegacy: true,
		});
	});
});
