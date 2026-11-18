/**
 * Checks on a participant's raw Yjs update before it touches the shared doc
 *
 * Checked edits (agents, custom renderers) go through applyEdit. Typing goes
 * in as Yjs updates, which could otherwise write anything: other root types,
 * nested types, undeclared fields, or values of the wrong type.
 *
 * - The update may only touch the mode's root: "content" text (freeform) or
 *   the "fields" map (structured).
 * - Freeform: only text. Structured: only plain values in declared fields,
 *   a number for a number field and a string for the rest.
 * - The doc may not grow past MAX_WORKSPACE_CHARS.
 *
 * A freeform .json file is not checked against its schema here: typing passes
 * through invalid JSON on the way to valid JSON. Checked edits refuse to make
 * a valid file invalid (editWorkspace).
 */

import * as Y from "yjs";
import {
	getFields,
	getText,
	type WorkspaceField,
	type WorkspaceMode,
} from "./workspace-edit";

export const MAX_WORKSPACE_CHARS = 200_000;

type Target = {
	doc: Y.Doc;
	settings: { mode: WorkspaceMode; fields: WorkspaceField[] };
};

function rootName(mode: WorkspaceMode): string {
	return mode === "freeform" ? "content" : "fields";
}

function isAllowedContent(mode: WorkspaceMode, content: unknown): boolean {
	if (content instanceof Y.ContentDeleted) return true;
	if (mode === "freeform") {
		return (
			content instanceof Y.ContentString || content instanceof Y.ContentFormat
		);
	}
	return content instanceof Y.ContentAny;
}

function fieldValueError(
	def: WorkspaceField | undefined,
	id: string,
	value: unknown,
): string | null {
	if (!def) return `unknown field "${id}"`;
	if (def.type === "number") {
		return typeof value === "number" ? null : `field "${id}" must be a number`;
	}
	return typeof value === "string" ? null : `field "${id}" must be a string`;
}

/** Why the update is refused, or null if it may be applied. */
export function checkClientUpdate(
	workspace: Target,
	update: Uint8Array,
): string | null {
	const { mode, fields } = workspace.settings;
	const root = rootName(mode);
	const defs = new Map(fields.map((f) => [f.id, f]));

	let decoded: ReturnType<typeof Y.decodeUpdate>;
	try {
		decoded = Y.decodeUpdate(update);
	} catch {
		return "malformed update";
	}

	// What the update says on its face. An item that continues another
	// (origin set) carries no parent: it inherits the one already checked.
	for (const struct of decoded.structs) {
		if (!(struct instanceof Y.Item)) continue;
		const { parent, parentSub, content } = struct as Y.Item & {
			parent: unknown;
		};
		if (typeof parent === "string" && parent !== root) {
			return `writes outside the workspace ("${parent}")`;
		}
		if (
			parent !== null &&
			typeof parent === "object" &&
			!(parent instanceof Y.AbstractType)
		) {
			// An ID: the item sits inside a nested type, which workspaces never have
			return "writes a nested type";
		}
		if (!isAllowedContent(mode, content)) {
			return "writes content this workspace does not hold";
		}
		if (mode === "structured") {
			if (typeof parent === "string" && parentSub === null) {
				return "writes a list into the fields map";
			}
			if (typeof parentSub === "string" && !defs.has(parentSub)) {
				return `unknown field "${parentSub}"`;
			}
		}
	}

	// What the doc would become. Only fields this update changes are checked,
	// so a value saved before these checks doesn't block later edits.
	const copy = new Y.Doc();
	try {
		Y.applyUpdate(copy, Y.encodeStateAsUpdate(workspace.doc));
		if (mode === "freeform") {
			const length = getText(copy).length;
			Y.applyUpdate(copy, update);
			const after = getText(copy).length;
			if (after > MAX_WORKSPACE_CHARS && after > length) {
				return "the workspace is too long";
			}
			return null;
		}
		const before = getFields(copy).toJSON();
		Y.applyUpdate(copy, update);
		const after = getFields(copy).toJSON();
		for (const [id, value] of Object.entries(after)) {
			if (Object.is(before[id], value)) continue;
			const error = fieldValueError(defs.get(id), id, value);
			if (error) return error;
		}
		const size = JSON.stringify(after).length;
		if (size > MAX_WORKSPACE_CHARS && size > JSON.stringify(before).length) {
			return "the workspace is too long";
		}
		return null;
	} catch {
		return "malformed update";
	} finally {
		copy.destroy();
	}
}
