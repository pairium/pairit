import { describe, expect, test } from "bun:test";
import * as Y from "yjs";
import { rebuildWorkspace } from "./workspace-authorship";

/** Record each update a doc emits, labelled with the transaction's origin. */
function recorder(doc: Y.Doc) {
	const log: Array<{ origin: string; update: Uint8Array }> = [];
	doc.on("update", (update: Uint8Array, origin: unknown) =>
		log.push({ origin: String(origin), update }),
	);
	return log;
}

describe("rebuildWorkspace", () => {
	test("splits the final text by who inserted it", () => {
		const doc = new Y.Doc();
		const log = recorder(doc);
		const text = doc.getText("content");
		doc.transact(() => text.insert(0, "# Plan\n"), "seed");
		doc.transact(() => text.insert(7, "Goal: ship.\n"), "agent:writer");
		doc.transact(() => text.insert(7, "Draft. "), "session:a");
		// A deleted span no longer counts for anyone.
		doc.transact(() => text.delete(14, 6), "session:a");

		const rebuilt = rebuildWorkspace(log);
		expect(rebuilt.content).toBe("# Plan\nDraft. ship.\n");
		expect(rebuilt.authorship).toEqual([
			{ origin: "seed", text: "# Plan\n" },
			{ origin: "session:a", text: "Draft. " },
			{ origin: "agent:writer", text: "ship.\n" },
		]);
	});

	test("a resent update does not change who wrote it", () => {
		const doc = new Y.Doc();
		const log = recorder(doc);
		doc.transact(() => doc.getText("content").insert(0, "hi"), "session:a");
		log.push({ origin: "session:b", update: log[0].update });
		expect(rebuildWorkspace(log).authorship).toEqual([
			{ origin: "session:a", text: "hi" },
		]);
	});

	test("names who last set each field", () => {
		const doc = new Y.Doc();
		const log = recorder(doc);
		const fields = doc.getMap("fields");
		doc.transact(() => fields.set("score", 1), "session:a");
		doc.transact(() => fields.set("notes", "ok"), "session:a");
		doc.transact(() => fields.set("score", 4), "agent:judge");

		const rebuilt = rebuildWorkspace(log);
		expect(rebuilt.fields).toEqual({ score: 4, notes: "ok" });
		expect(rebuilt.fieldAuthors).toEqual({
			score: "agent:judge",
			notes: "session:a",
		});
	});
});
