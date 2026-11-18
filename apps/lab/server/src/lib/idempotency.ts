import { MongoServerError } from "mongodb";
import { getIdempotencyCollection } from "./db";

/**
 * The stored key. Scoped by session, so one session's key can never match
 * (and so never block or reveal) another session's request.
 */
export function scopedIdempotencyKey(sessionId: string, key: string): string {
	return `${sessionId}:${key}`;
}

/** Records the key; `duplicate` if this session already used it. */
export async function claimIdempotencyKey(
	sessionId: string,
	key: string,
): Promise<{ duplicate: boolean }> {
	const collection = await getIdempotencyCollection();
	try {
		await collection.insertOne({
			key: scopedIdempotencyKey(sessionId, key),
			sessionId,
			createdAt: new Date(),
		});
		return { duplicate: false };
	} catch (err) {
		if (err instanceof MongoServerError && err.code === 11000) {
			return { duplicate: true };
		}
		throw err;
	}
}
