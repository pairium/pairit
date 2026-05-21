/**
 * One-time backfill: stamp `configId` onto existing `chat_messages` documents.
 *
 * For each chat_messages doc missing `configId`, resolves it by looking up the
 * referenced session and copying its `configId`. Messages whose session no
 * longer exists are reported and left untouched.
 *
 * Safe to re-run: only operates on docs where `configId` is missing.
 *
 * Usage:
 *   bun --env-file=.env scripts/backfill-chat-messages-configid.ts
 */

import { closeDB, connectDB } from "../packages/db";

async function main() {
	const db = await connectDB();
	const chatMessages = db.collection("chat_messages");
	const sessions = db.collection("sessions");

	const total = await chatMessages.countDocuments({
		configId: { $exists: false },
	});
	console.log(`Found ${total} chat_messages without configId.`);

	if (total === 0) {
		await closeDB();
		return;
	}

	const sessionIds: string[] = await chatMessages.distinct("sessionId", {
		configId: { $exists: false },
	});
	console.log(`Resolving ${sessionIds.length} distinct sessionId(s)...`);

	const sessionDocs = await sessions
		.find(
			{ id: { $in: sessionIds } },
			{ projection: { id: 1, configId: 1 } },
		)
		.toArray();

	const sessionToConfig = new Map<string, string>();
	for (const s of sessionDocs) {
		if (typeof s.id === "string" && typeof s.configId === "string") {
			sessionToConfig.set(s.id, s.configId);
		}
	}

	const missing = sessionIds.filter((id) => !sessionToConfig.has(id));
	if (missing.length > 0) {
		console.warn(
			`Warning: ${missing.length} sessionId(s) referenced by chat_messages have no matching session. Their messages will be skipped.`,
		);
		console.warn(`First few: ${missing.slice(0, 5).join(", ")}`);
	}

	let updated = 0;
	for (const [sessionId, configId] of sessionToConfig) {
		const result = await chatMessages.updateMany(
			{ sessionId, configId: { $exists: false } },
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
