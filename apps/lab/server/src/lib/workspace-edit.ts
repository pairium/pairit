/**
 * Workspace edits that need checking before they touch the doc
 * Agents and custom renderers edit through applyEdit; participants' typing
 * goes into the doc directly as Yjs updates.
 */

import * as Y from "yjs";

export type WorkspaceMode = "freeform" | "structured";

export type WorkspaceField = {
	id: string;
	label?: string;
	type?: "text" | "number" | "textarea";
};

export type WorkspaceEdit =
	| { kind: "replace"; old: string; new: string; replaceAll?: boolean }
	| { kind: "write"; content: string }
	| { kind: "fields"; fields: Record<string, unknown> };

/** A refused edit. The message is written for the agent that made it. */
export class EditError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "EditError";
	}
}

// Seeds use a fixed client id, so two servers seeding the same doc produce
// identical Yjs items that merge into one copy instead of two.
const SEED_CLIENT_ID = 0;

export function getText(doc: Y.Doc): Y.Text {
	return doc.getText("content");
}

export function getFields(doc: Y.Doc): Y.Map<unknown> {
	return doc.getMap("fields");
}

/** The Yjs update that creates a doc from a template. */
export function seedUpdate(
	mode: WorkspaceMode,
	content: string,
	fields: Record<string, unknown> = {},
): Uint8Array {
	const doc = new Y.Doc();
	doc.clientID = SEED_CLIENT_ID;
	doc.transact(() => {
		if (mode === "freeform") {
			if (content) getText(doc).insert(0, content);
		} else {
			const map = getFields(doc);
			for (const [key, value] of Object.entries(fields)) map.set(key, value);
		}
	});
	return Y.encodeStateAsUpdate(doc);
}

/**
 * Apply a checked edit. `base` is the doc as the editor last read it (a Yjs
 * update). Whole writes and field writes are made against it and merged in,
 * so changes made since then by others are kept rather than overwritten.
 */
export function applyEdit(
	doc: Y.Doc,
	mode: WorkspaceMode,
	fieldDefs: WorkspaceField[],
	edit: WorkspaceEdit,
	origin: string,
	base?: Uint8Array,
): void {
	if (edit.kind === "replace") {
		if (mode !== "freeform") {
			throw new EditError("This workspace has fields, not a document.");
		}
		replaceText(doc, edit.old, edit.new, edit.replaceAll ?? false, origin);
		return;
	}
	if (edit.kind === "fields" && mode !== "structured") {
		throw new EditError("This workspace is a document, not fields.");
	}
	if (edit.kind === "write" && mode !== "freeform") {
		throw new EditError("This workspace has fields, not a document.");
	}

	// Make the change on a copy of what the editor saw, then merge it in.
	// The copy gets a fresh client id, so its changes never clash with the doc's.
	const target = base ? new Y.Doc() : doc;
	if (base) Y.applyUpdate(target, base);
	const before = Y.encodeStateVector(target);
	if (edit.kind === "write") writeText(target, edit.content, origin);
	else setFields(target, fieldDefs, edit.fields, origin);
	if (base) {
		const change = Y.encodeStateAsUpdate(target, before);
		target.destroy();
		Y.applyUpdate(doc, change, origin);
	}
}

/**
 * Replace the whole text by its changed middle only, so a participant typing
 * outside that range keeps their text.
 */
function writeText(doc: Y.Doc, content: string, origin: string): void {
	const text = getText(doc);
	const current = text.toString();
	let start = 0;
	const maxStart = Math.min(current.length, content.length);
	while (start < maxStart && current[start] === content[start]) start++;
	let end = 0;
	const maxEnd = Math.min(current.length, content.length) - start;
	while (
		end < maxEnd &&
		current[current.length - 1 - end] === content[content.length - 1 - end]
	) {
		end++;
	}
	const deleteLength = current.length - start - end;
	const insert = content.slice(start, content.length - end);
	if (deleteLength === 0 && insert === "") return;
	doc.transact(() => {
		if (deleteLength > 0) text.delete(start, deleteLength);
		if (insert) text.insert(start, insert);
	}, origin);
}

function replaceText(
	doc: Y.Doc,
	oldText: string,
	newText: string,
	replaceAll: boolean,
	origin: string,
): void {
	if (oldText === "") {
		throw new EditError(
			"The text to replace is empty. Quote the text to replace.",
		);
	}
	const text = getText(doc);
	const current = text.toString();
	const positions: number[] = [];
	for (
		let i = current.indexOf(oldText);
		i !== -1;
		i = current.indexOf(oldText, i + oldText.length)
	) {
		positions.push(i);
	}
	if (positions.length === 0) {
		throw new EditError(
			"The text to replace was not found. The file may have changed; view it again.",
		);
	}
	if (positions.length > 1 && !replaceAll) {
		const lines = positions.map((p) => lineOf(current, p)).join(", ");
		throw new EditError(
			`The text to replace matches ${positions.length} times (lines ${lines}). Add surrounding lines to make it unique.`,
		);
	}
	doc.transact(() => {
		// Right to left, so earlier positions stay valid.
		for (const position of [...positions].reverse()) {
			text.delete(position, oldText.length);
			if (newText) text.insert(position, newText);
		}
	}, origin);
}

function lineOf(text: string, position: number): number {
	let line = 1;
	for (let i = 0; i < position; i++) if (text[i] === "\n") line++;
	return line;
}

/** Write only the fields that changed, after checking every one. */
function setFields(
	doc: Y.Doc,
	fieldDefs: WorkspaceField[],
	fields: Record<string, unknown>,
	origin: string,
): void {
	const defs = new Map(fieldDefs.map((f) => [f.id, f]));
	const changes: Array<[string, unknown]> = [];
	const map = getFields(doc);
	for (const [id, value] of Object.entries(fields)) {
		const def = defs.get(id);
		if (!def) {
			throw new EditError(
				`Unknown field "${id}". Fields are: ${[...defs.keys()].join(", ")}.`,
			);
		}
		if (def.type === "number") {
			if (typeof value !== "number" || !Number.isFinite(value)) {
				throw new EditError(`Field "${id}" must be a number.`);
			}
		} else if (typeof value !== "string") {
			throw new EditError(`Field "${id}" must be a string.`);
		}
		if (map.get(id) !== value) changes.push([id, value]);
	}
	if (changes.length === 0) return;
	doc.transact(() => {
		for (const [id, value] of changes) map.set(id, value);
	}, origin);
}
