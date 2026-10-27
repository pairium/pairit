import { describe, expect, test } from "bun:test";
import { checkWorkspaceText } from "./workspace-validate";

const schema = {
	type: "object",
	properties: { pieces: { type: "array", items: { type: "string" } } },
	required: ["pieces"],
};

describe("checkWorkspaceText", () => {
	test("takes any text in a non-JSON file", () => {
		expect(checkWorkspaceText("workspace.md", "{ not json")).toBeNull();
	});

	test("a .json file must parse", () => {
		expect(checkWorkspaceText("board.json", '{"a": 1}')).toBeNull();
		expect(checkWorkspaceText("board.json", "{")).toContain(
			"board.json would not be valid JSON",
		);
	});

	test("a .json file must match its schema", () => {
		expect(
			checkWorkspaceText("board.json", '{"pieces": ["a"]}', schema),
		).toBeNull();
		expect(checkWorkspaceText("board.json", '{"pieces": [1]}', schema)).toBe(
			"board.json would not match its schema: /pieces/0 must be string.",
		);
		expect(checkWorkspaceText("board.json", "{}", schema)).toContain(
			"must have required property 'pieces'",
		);
	});
});
