/**
 * One-time migration: rename `user_state` → `session_state` on all session documents.
 *
 * Usage:
 *   bun --env-file=.env scripts/migrate-user-state-to-session-state.ts
 */

import { closeDB, connectDB } from "../packages/db";

async function main() {
	const db = await connectDB();
	const sessions = db.collection("sessions");

	const result = await sessions.updateMany(
		{ user_state: { $exists: true } },
		{ $rename: { user_state: "session_state" } },
	);

	console.log(
		`Migration complete: ${result.modifiedCount} session(s) updated (user_state → session_state).`,
	);

	await closeDB();
}

main().catch((err) => {
	console.error("Migration failed:", err);
	process.exit(1);
});
