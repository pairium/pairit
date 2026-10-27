/**
 * Rebuild a workspace from its update log and say who wrote what
 * Each logged update carries its origin. Every Yjs item has an id (client,
 * clock) inside exactly one logged update, so the final text can be split into
 * spans by the origin that inserted them.
 */

import * as Y from "yjs";

export type LoggedUpdate = { origin: string; update: Uint8Array };

export type AuthorshipSpan = { origin: string; text: string };

export type RebuiltWorkspace = {
	content: string;
	fields: Record<string, unknown>;
	// Freeform: the final text, in order, split by who inserted it
	authorship: AuthorshipSpan[];
	// Structured: who last set each field
	fieldAuthors: Record<string, string>;
};

type Range = { start: number; end: number; origin: string };

export function rebuildWorkspace(updates: LoggedUpdate[]): RebuiltWorkspace {
	const doc = new Y.Doc();
	const ranges = new Map<number, Range[]>();
	for (const { origin, update } of updates) {
		for (const struct of Y.decodeUpdate(update).structs) {
			if (!(struct instanceof Y.Item)) continue;
			const { client, clock } = struct.id;
			let list = ranges.get(client);
			if (!list) {
				list = [];
				ranges.set(client, list);
			}
			list.push({ start: clock, end: clock + struct.length, origin });
		}
		Y.applyUpdate(doc, update);
	}

	// The first update to carry an item inserted it; later copies are resends.
	const originOf = (id: Y.ID): string =>
		ranges.get(id.client)?.find((r) => id.clock >= r.start && id.clock < r.end)
			?.origin ?? "unknown";

	const text = doc.getText("content");
	const authorship: AuthorshipSpan[] = [];
	for (let item = text._start; item; item = item.right) {
		if (item.deleted || !(item.content instanceof Y.ContentString)) continue;
		const origin = originOf(item.id);
		const last = authorship.at(-1);
		if (last?.origin === origin) last.text += item.content.str;
		else authorship.push({ origin, text: item.content.str });
	}

	const fields = doc.getMap("fields");
	const fieldAuthors: Record<string, string> = {};
	for (const [key, item] of fields._map) {
		if (!item.deleted) fieldAuthors[key] = originOf(item.id);
	}

	return {
		content: text.toString(),
		fields: fields.toJSON(),
		authorship,
		fieldAuthors,
	};
}
