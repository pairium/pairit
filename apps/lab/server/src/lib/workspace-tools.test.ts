import { describe, expect, test } from "bun:test";
import { parsePatch, replaceOnce } from "./workspace-tools";

describe("parsePatch", () => {
	test("turns hunks into find/replace pairs", () => {
		const diff = [
			"@@ ## Goal",
			" ## Goal",
			"-TBD",
			"+Ship it.",
			"@@",
			" ## Timeline",
			"+Two weeks.",
		].join("\n");
		expect(parsePatch(diff)).toEqual([
			{ old: "## Goal\nTBD", new: "## Goal\nShip it." },
			{ old: "## Timeline", new: "## Timeline\nTwo weeks." },
		]);
	});

	test("accepts a diff without an @@ header and skips *** markers", () => {
		expect(parsePatch("-a\n+b\n*** End of File")).toEqual([
			{ old: "a", new: "b" },
		]);
	});

	test("refuses a hunk with nothing to place it by", () => {
		expect(() => parsePatch("@@\n+only added")).toThrow(
			"at least one context or removed line",
		);
	});
});

describe("replaceOnce", () => {
	test("replaces text that appears once", () => {
		expect(replaceOnce("a b c", "b", "B")).toBe("a B c");
	});

	test("refuses missing or repeated text with a next step", () => {
		expect(() => replaceOnce("a", "b", "c")).toThrow("view it again");
		expect(() => replaceOnce("x x", "x", "y")).toThrow(
			"matches 2 times. Add surrounding lines",
		);
	});

	test("replaces every match when asked", () => {
		expect(replaceOnce("x x", "x", "y", true)).toBe("y y");
	});
});
