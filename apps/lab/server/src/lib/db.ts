/**
 * MongoDB connection and collection helpers for lab server
 * Uses shared @pairit/db module for singleton connection
 */

import { connectDB } from "@pairit/db";
import type { Collection } from "mongodb";
import type {
	ConfigDocument,
	EventDocument,
	IdempotencyRecord,
	SessionDocument,
} from "../types";

export { closeDB, connectDB } from "@pairit/db";

export async function getConfigsCollection(): Promise<
	Collection<ConfigDocument>
> {
	const database = await connectDB();
	return database.collection<ConfigDocument>("configs");
}

export async function getSessionsCollection(): Promise<
	Collection<SessionDocument>
> {
	const database = await connectDB();
	return database.collection<SessionDocument>("sessions");
}

export async function getEventsCollection(): Promise<
	Collection<EventDocument>
> {
	const database = await connectDB();
	return database.collection<EventDocument>("events");
}

export async function getIdempotencyCollection(): Promise<
	Collection<IdempotencyRecord>
> {
	const database = await connectDB();
	return database.collection<IdempotencyRecord>("idempotency_keys");
}

export async function ensureIndexes(): Promise<void> {
	const database = await connectDB();

	await database
		.collection("sessions")
		.createIndex({ id: 1 }, { unique: true });
	await database
		.collection("events")
		.createIndex({ sessionId: 1, createdAt: 1 });
	await database
		.collection("events")
		.createIndex({ idempotencyKey: 1 }, { unique: true, sparse: true });
	await database
		.collection("configs")
		.createIndex({ configId: 1 }, { unique: true });
	await database
		.collection("idempotency_keys")
		.createIndex({ key: 1 }, { unique: true });
	await database
		.collection("idempotency_keys")
		.createIndex({ createdAt: 1 }, { expireAfterSeconds: 86400 });

	console.log("[DB] All indexes ensured");
}
