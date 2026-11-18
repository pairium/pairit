import { describe, expect, test } from "bun:test";
import * as Y from "yjs";
import { getFields, getText, seedUpdate } from "./workspace-edit";
import {
	checkClientUpdate,
	MAX_WORKSPACE_CHARS,
} from "./workspace-update-check";

const fields = [
	{ id: "score", type: "number" as const },
	{ id: "notes", type: "textarea" as const },
];

function server(mode: "freeform" | "structured", content = "") {
	const doc = new Y.Doc();
	Y.applyUpdate(doc, seedUpdate(mode, content));
	return { doc, settings: { mode, fields } };
}

/** A client's change to its copy of the server doc, as the update it sends. */
function clientUpdate(serverDoc: Y.Doc, change: (doc: Y.Doc) => void) {
	const doc = new Y.Doc();
	Y.applyUpdate(doc, Y.encodeStateAsUpdate(serverDoc));
	const before = Y.encodeStateVector(doc);
	change(doc);
	return Y.encodeStateAsUpdate(doc, before);
}

describe("checkClientUpdate", () => {
	test("accepts typing in a freeform doc", () => {
		const ws = server("freeform", "hello");
		const update = clientUpdate(ws.doc, (d) => getText(d).insert(5, " world"));
		expect(checkClientUpdate(ws, update)).toBeNull();
	});

	test("accepts declared fields with the right types", () => {
		const ws = server("structured");
		const update = clientUpdate(ws.doc, (d) => {
			getFields(d).set("score", 3);
			getFields(d).set("notes", "ok");
		});
		expect(checkClientUpdate(ws, update)).toBeNull();
	});

	test("accepts overwriting a field", () => {
		const ws = server("structured");
		Y.applyUpdate(
			ws.doc,
			clientUpdate(ws.doc, (d) => getFields(d).set("notes", "a")),
		);
		const update = clientUpdate(ws.doc, (d) => getFields(d).set("notes", "b"));
		expect(checkClientUpdate(ws, update)).toBeNull();
	});

	test("refuses an undeclared field", () => {
		const ws = server("structured");
		const update = clientUpdate(ws.doc, (d) => getFields(d).set("admin", "x"));
		expect(checkClientUpdate(ws, update)).toContain("unknown field");
	});

	test("refuses a value of the wrong type", () => {
		const ws = server("structured");
		const update = clientUpdate(ws.doc, (d) =>
			getFields(d).set("score", "high"),
		);
		expect(checkClientUpdate(ws, update)).toContain("must be a number");
	});

	test("refuses a nested type as a field value", () => {
		const ws = server("structured");
		const update = clientUpdate(ws.doc, (d) =>
			getFields(d).set("notes", new Y.Map()),
		);
		expect(checkClientUpdate(ws, update)).not.toBeNull();
	});

	test("refuses writes to another root", () => {
		const ws = server("freeform", "hi");
		const update = clientUpdate(ws.doc, (d) => d.getMap("other").set("a", 1));
		expect(checkClientUpdate(ws, update)).toContain("outside the workspace");
	});

	test("refuses fields in a freeform doc", () => {
		const ws = server("freeform", "hi");
		const update = clientUpdate(ws.doc, (d) => getFields(d).set("score", 1));
		expect(checkClientUpdate(ws, update)).toContain("outside the workspace");
	});

	test("refuses growing the doc past the limit", () => {
		const ws = server("freeform", "");
		const update = clientUpdate(ws.doc, (d) =>
			getText(d).insert(0, "x".repeat(MAX_WORKSPACE_CHARS + 1)),
		);
		expect(checkClientUpdate(ws, update)).toContain("too long");
	});

	test("refuses bytes that are not an update", () => {
		const ws = server("freeform", "");
		expect(checkClientUpdate(ws, new Uint8Array([255, 1, 2, 3]))).toBe(
			"malformed update",
		);
	});
});
