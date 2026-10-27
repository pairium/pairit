import { describe, expect, test } from "bun:test";
import * as Y from "yjs";
import {
	applyEdit,
	EditError,
	getFields,
	getText,
	seedUpdate,
} from "./workspace-edit";

function docWith(content: string): Y.Doc {
	const doc = new Y.Doc();
	Y.applyUpdate(doc, seedUpdate("freeform", content));
	return doc;
}

const fieldDefs = [
	{ id: "score", type: "number" as const },
	{ id: "notes", type: "textarea" as const },
];

describe("seedUpdate", () => {
	test("two seeds of the same template merge into one copy", () => {
		const doc = new Y.Doc();
		Y.applyUpdate(doc, seedUpdate("freeform", "# Title\n"));
		Y.applyUpdate(doc, seedUpdate("freeform", "# Title\n"));
		expect(getText(doc).toString()).toBe("# Title\n");
	});
});

describe("write", () => {
	test("keeps a participant's concurrent typing outside the changed part", () => {
		const server = docWith("# Plan\n\nGoal: TBD\n");
		const participant = new Y.Doc();
		Y.applyUpdate(participant, Y.encodeStateAsUpdate(server));

		// The participant types at the top while the agent rewrites the goal.
		getText(participant).insert(0, "Draft. ");
		applyEdit(
			server,
			"freeform",
			[],
			{ kind: "write", content: "# Plan\n\nGoal: ship it\n" },
			"agent:writer",
		);

		Y.applyUpdate(server, Y.encodeStateAsUpdate(participant));
		Y.applyUpdate(participant, Y.encodeStateAsUpdate(server));
		const expected = "Draft. # Plan\n\nGoal: ship it\n";
		expect(getText(server).toString()).toBe(expected);
		expect(getText(participant).toString()).toBe(expected);
	});

	test("keeps typing that reached the server before the agent's write", () => {
		// The agent reads the doc, then a participant's typing arrives, then
		// the agent's whole-doc write, made from what it read, arrives.
		const doc = docWith("# Plan\n\n## Goal\n\n## Timeline\n");
		const base = Y.encodeStateAsUpdate(doc);
		getText(doc).insert(getText(doc).length, "Two weeks.\n");
		applyEdit(
			doc,
			"freeform",
			[],
			{
				kind: "write",
				content: "# Plan\n\n## Goal\nShip it.\n\n## Timeline\n",
			},
			"agent:writer",
			base,
		);
		expect(getText(doc).toString()).toBe(
			"# Plan\n\n## Goal\nShip it.\n\n## Timeline\nTwo weeks.\n",
		);
	});

	test("a field write made from an old read keeps fields set since", () => {
		const doc = new Y.Doc();
		Y.applyUpdate(doc, seedUpdate("structured", "", { notes: "", score: 1 }));
		const base = Y.encodeStateAsUpdate(doc);
		getFields(doc).set("notes", "typed since");
		applyEdit(
			doc,
			"structured",
			fieldDefs,
			{ kind: "fields", fields: { notes: "", score: 5 } },
			"agent:judge",
			base,
		);
		expect(getFields(doc).toJSON()).toEqual({ notes: "typed since", score: 5 });
	});

	test("an unchanged write makes no change", () => {
		const doc = docWith("same");
		let updates = 0;
		doc.on("update", () => updates++);
		applyEdit(doc, "freeform", [], { kind: "write", content: "same" }, "a");
		expect(updates).toBe(0);
	});

	test("records the origin", () => {
		const doc = docWith("a");
		const origins: unknown[] = [];
		doc.on("update", (_u: Uint8Array, origin: unknown) => origins.push(origin));
		applyEdit(doc, "freeform", [], { kind: "write", content: "ab" }, "agent:x");
		expect(origins).toEqual(["agent:x"]);
	});
});

describe("replace", () => {
	test("replaces text that appears once", () => {
		const doc = docWith("one two three");
		applyEdit(
			doc,
			"freeform",
			[],
			{ kind: "replace", old: "two", new: "2" },
			"a",
		);
		expect(getText(doc).toString()).toBe("one 2 three");
	});

	test("refuses text that appears more than once, naming the lines", () => {
		const doc = docWith("x\ny\nx\n");
		expect(() =>
			applyEdit(
				doc,
				"freeform",
				[],
				{ kind: "replace", old: "x", new: "z" },
				"a",
			),
		).toThrow("old_string matches 2 times (lines 1, 3)");
	});

	test("replaceAll replaces every match", () => {
		const doc = docWith("x y x");
		applyEdit(
			doc,
			"freeform",
			[],
			{ kind: "replace", old: "x", new: "zz", replaceAll: true },
			"a",
		);
		expect(getText(doc).toString()).toBe("zz y zz");
	});

	test("refuses text that is not there", () => {
		const doc = docWith("abc");
		expect(() =>
			applyEdit(
				doc,
				"freeform",
				[],
				{ kind: "replace", old: "q", new: "r" },
				"a",
			),
		).toThrow(EditError);
	});
});

describe("fields", () => {
	test("writes only the fields that changed", () => {
		const doc = new Y.Doc();
		Y.applyUpdate(doc, seedUpdate("structured", "", { notes: "hi", score: 1 }));
		const changed: string[] = [];
		getFields(doc).observe((event) => changed.push(...event.keysChanged));
		applyEdit(
			doc,
			"structured",
			fieldDefs,
			{ kind: "fields", fields: { notes: "hi", score: 5 } },
			"a",
		);
		expect(changed).toEqual(["score"]);
		expect(getFields(doc).toJSON()).toEqual({ notes: "hi", score: 5 });
	});

	test("refuses unknown fields and wrong types", () => {
		const doc = new Y.Doc();
		expect(() =>
			applyEdit(
				doc,
				"structured",
				fieldDefs,
				{ kind: "fields", fields: { other: "x" } },
				"a",
			),
		).toThrow('Unknown field "other"');
		expect(() =>
			applyEdit(
				doc,
				"structured",
				fieldDefs,
				{ kind: "fields", fields: { score: "high" } },
				"a",
			),
		).toThrow('Field "score" must be a number.');
	});

	test("refuses a text edit on a fields workspace", () => {
		expect(() =>
			applyEdit(
				new Y.Doc(),
				"structured",
				fieldDefs,
				{ kind: "write", content: "x" },
				"a",
			),
		).toThrow(EditError);
	});
});
