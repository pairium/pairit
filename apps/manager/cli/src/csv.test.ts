import { describe, expect, test } from "bun:test";
import { escapeCsvValue } from "./csv";

describe("escapeCsvValue", () => {
	test.each([
		[null, ""],
		[undefined, ""],
		["plain", "plain"],
		["a,b", '"a,b"'],
		['say "hi"', '"say ""hi"""'],
		["line\nbreak", '"line\nbreak"'],
		["carriage\rreturn", '"carriage\rreturn"'],
		['=HYPERLINK("http://x")', '"\'=HYPERLINK(""http://x"")"'],
		["+1+2", "'+1+2"],
		["-2+3", "'-2+3"],
		["-5", "-5"],
		["+3.25", "+3.25"],
		["-1e3", "-1e3"],
		["-5 apples", "'-5 apples"],
		["--5", "'--5"],
		["@SUM(A1)", "'@SUM(A1)"],
		["\t=1", "'\t=1"],
		["\r=1", '"\'\r=1"'],
		[-5, "-5"],
		[3.5, "3.5"],
		[true, "true"],
	])("%p -> %p", (input, expected) => {
		expect(escapeCsvValue(input)).toBe(expected);
	});
});
