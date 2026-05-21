/**
 * Second-pass backfill: stamp `configId` onto orphan chat_messages whose
 * `sessionId` does not resolve to any session document.
 *
 * The first-pass backfill (backfill-chat-messages-configid.ts) skipped these
 * because their `sessionId` is shaped like `agent:<name>` (known bad legacy
 * data from Feb 2026), so no session lookup is possible. Instead, resolve
 * `configId` via the message's `groupId` by finding sibling messages with the
 * same groupId that already have `configId`.
 *
 * Safe to re-run: only operates on docs where `configId` is missing.
 *
 * Usage:
 *   bun --env-file=.env scripts/backfill-chat-messages-configid-via-groupid.ts
 */

import { closeDB, connectDB } from "../packages/db";

async function main() {
	const db = await connectDB();
	const chatMessages = db.collection("chat_messages");

	const total = await chatMessages.countDocuments({
		configId: { $exists: false },
	});
	console.log(`Found ${total} chat_messages without configId.`);

	if (total === 0) {
		await closeDB();
		return;
	}

	const groupIds: string[] = await chatMessages.distinct("groupId", {
		configId: { $exists: false },
	});
	console.log(`Resolving ${groupIds.length} distinct groupId(s) via siblings...`);

	const groupToConfig = new Map<string, string>();
	const unresolved: string[] = [];

	for (const groupId of groupIds) {
		const sibling = await chatMessages.findOne(
			{ groupId, configId: { $exists: true } },
			{ projection: { configId: 1 } },
		);
		if (sibling && typeof sibling.configId === "string") {
			groupToConfig.set(groupId, sibling.configId);
		} else {
			unresolved.push(groupId);
		}
	}

	if (unresolved.length > 0) {
		console.warn(
			`Warning: ${unresolved.length} groupId(s) have no sibling with configId. Their messages will be skipped.`,
		);
		console.warn(`First few: ${unresolved.slice(0, 5).join(", ")}`);
	}

	let updated = 0;
	for (const [groupId, configId] of groupToConfig) {
		const result = await chatMessages.updateMany(
			{ groupId, configId: { $exists: false } },
			{ $set: { configId } },
		);
		updated += result.modifiedCount;
	}

	console.log(
		`Backfill complete: ${updated} chat_messages updated, ${total - updated} left unchanged.`,
	);

	await closeDB();
}

main().catch((err) => {
	console.error("Backfill failed:", err);
	process.exit(1);
});
