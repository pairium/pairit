/**
 * One-time migration: drop the old {configId, sortField} compound indexes
 * that have been replaced by {configId, sortField, _id} (defined in
 * apps/lab/server/src/lib/db.ts). The new indexes are a strict superset:
 * any query the old index served can be served by the new one.
 *
 * Refuses to drop an old index unless its replacement is present, so it
 * is safe to run before/independently of the lab-server redeploy.
 *
 * Safe to re-run.
 *
 * Usage:
 *   bun --env-file=.env scripts/drop-redundant-export-indexes.ts
 */

import type { Document } from "mongodb";
import { closeDB, connectDB } from "../packages/db";

type Replacement = {
	collection: string;
	oldName: string;
	oldKey: Document;
	newKey: Document;
};

const REPLACEMENTS: Replacement[] = [
	{
		collection: "events",
		oldName: "configId_1_createdAt_1",
		oldKey: { configId: 1, createdAt: 1 },
		newKey: { configId: 1, createdAt: 1, _id: 1 },
	},
	{
		collection: "chat_messages",
		oldName: "configId_1_createdAt_1",
		oldKey: { configId: 1, createdAt: 1 },
		newKey: { configId: 1, createdAt: 1, _id: 1 },
	},
	{
		collection: "sessions",
		oldName: "configId_1_createdAt_1",
		oldKey: { configId: 1, createdAt: 1 },
		newKey: { configId: 1, createdAt: 1, _id: 1 },
	},
	{
		collection: "groups",
		oldName: "configId_1_matchedAt_1",
		oldKey: { configId: 1, matchedAt: 1 },
		newKey: { configId: 1, matchedAt: 1, _id: 1 },
	},
	{
		collection: "workspace_documents",
		oldName: "configId_1_updatedAt_1",
		oldKey: { configId: 1, updatedAt: 1 },
		newKey: { configId: 1, updatedAt: 1, _id: 1 },
	},
];

function keysEqual(a: Document, b: Document): boolean {
	const ak = Object.keys(a);
	const bk = Object.keys(b);
	if (ak.length !== bk.length) return false;
	return ak.every((k, i) => k === bk[i] && a[k] === b[k]);
}

async function main() {
	const db = await connectDB();

	for (const r of REPLACEMENTS) {
		const indexes = (await db
			.collection(r.collection)
			.indexes()) as Document[];

		const oldIdx = indexes.find((i) => keysEqual(i.key, r.oldKey));
		const newIdx = indexes.find((i) => keysEqual(i.key, r.newKey));

		if (!oldIdx) {
			console.log(
				`[${r.collection}] old index ${JSON.stringify(r.oldKey)} already gone — skipping`,
			);
			continue;
		}
		if (!newIdx) {
			console.warn(
				`[${r.collection}] replacement ${JSON.stringify(r.newKey)} not present — refusing to drop old index. Deploy lab-server first so ensureIndexes() builds it.`,
			);
			continue;
		}

		const dropName = oldIdx.name ?? r.oldName;
		console.log(`[${r.collection}] dropping ${dropName}...`);
		await db.collection(r.collection).dropIndex(dropName);
		console.log(`[${r.collection}] dropped ${dropName}`);
	}

	await closeDB();
}

main().catch((err) => {
	console.error("Migration failed:", err);
	process.exit(1);
});
