/**
 * MongoDB connection and collection helpers for lab server
 * Uses shared @pairit/db module for singleton connection
 */

import { connectDB } from "@pairit/db";
import type { Collection } from "mongodb";
import type {
	ChatMessageDocument,
	ConfigDocument,
	EventDocument,
	GroupDocument,
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

export async function getChatMessagesCollection(): Promise<
	Collection<ChatMessageDocument>
> {
	const database = await connectDB();
	return database.collection<ChatMessageDocument>("chat_messages");
}

export async function getGroupsCollection(): Promise<
	Collection<GroupDocument>
> {
	const database = await connectDB();
	return database.collection<GroupDocument>("groups");
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

	await database
		.collection("chat_messages")
		.createIndex({ groupId: 1, createdAt: 1 });
	await database
		.collection("chat_messages")
		.createIndex({ idempotencyKey: 1 }, { unique: true, sparse: true });

	await database
		.collection("groups")
		.createIndex({ groupId: 1 }, { unique: true });

	// Session resumption indexes
	// OAuth user lookup: find sessions by userId + configId
	await database
		.collection("sessions")
		.createIndex({ userId: 1, configId: 1, createdAt: -1 }, { sparse: true });

	// Prolific participant lookup: find sessions by prolificPid + configId
	await database
		.collection("sessions")
		.createIndex(
			{ "prolific.prolificPid": 1, configId: 1, createdAt: -1 },
			{ sparse: true },
		);

	console.log("[DB] All indexes ensured");
}
