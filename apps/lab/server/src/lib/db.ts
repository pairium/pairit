/**
 * MongoDB connection and collection helpers for lab server
 * Uses shared @pairit/db module for singleton connection
 */

import { connectDB } from "@pairit/db";
import { type Collection, MongoServerError } from "mongodb";
import type {
	ChatMessageDocument,
	ConfigDocument,
	EventDocument,
	GroupDocument,
	IdempotencyRecord,
	SessionDocument,
	TimerDocument,
	WorkspaceDocumentDocument,
	WorkspaceUpdateDocument,
} from "../types";
import type { StartLock } from "./session-start-lock";

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

export async function getSessionStartLocksCollection(): Promise<
	Collection<StartLock>
> {
	const database = await connectDB();
	return database.collection<StartLock>("session_start_locks");
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

export async function getWorkspaceDocumentsCollection(): Promise<
	Collection<WorkspaceDocumentDocument>
> {
	const database = await connectDB();
	return database.collection<WorkspaceDocumentDocument>("workspace_documents");
}

export async function getWorkspaceUpdatesCollection(): Promise<
	Collection<WorkspaceUpdateDocument>
> {
	const database = await connectDB();
	return database.collection<WorkspaceUpdateDocument>("workspace_updates");
}

export async function getTimersCollection(): Promise<
	Collection<TimerDocument>
> {
	const database = await connectDB();
	return database.collection<TimerDocument>("timers");
}

const LEGACY_IDEMPOTENCY_INDEX = "idempotencyKey_1";
// MongoDB's IndexNotFound
const INDEX_NOT_FOUND = 27;

/**
 * Idempotency keys are unique per session, not across all sessions: a global
 * index let one session's key block (and reveal) another session's message.
 * The per-session index is built first, so duplicates within a session stay
 * rejected throughout; then the old global index is dropped. Both steps are
 * idempotent, and the old index only ever rejected more, so running this
 * on several instances at once, or beside older instances, is safe.
 */
export async function scopeIdempotencyIndex(
	collection: Collection,
): Promise<void> {
	await collection.createIndex(
		{ sessionId: 1, idempotencyKey: 1 },
		{
			unique: true,
			partialFilterExpression: { idempotencyKey: { $type: "string" } },
		},
	);
	try {
		await collection.dropIndex(LEGACY_IDEMPOTENCY_INDEX);
		console.log(
			`[DB] Dropped global ${LEGACY_IDEMPOTENCY_INDEX} on ${collection.collectionName}`,
		);
	} catch (err) {
		if (!(err instanceof MongoServerError && err.code === INDEX_NOT_FOUND)) {
			throw err;
		}
	}
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
		.createIndex({ configId: 1, createdAt: 1, _id: 1 });
	await scopeIdempotencyIndex(database.collection("events"));
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
		.createIndex({ configId: 1, createdAt: 1, _id: 1 });
	await scopeIdempotencyIndex(database.collection("chat_messages"));
	// Per-session chat limit (routes/chat.ts)
	await database
		.collection("chat_messages")
		.createIndex({ senderId: 1, senderType: 1 });

	await database
		.collection("groups")
		.createIndex({ groupId: 1 }, { unique: true });
	await database
		.collection("groups")
		.createIndex({ configId: 1, matchedAt: 1, _id: 1 });
	await database.collection("groups").createIndex({ memberSessionIds: 1 });

	await database
		.collection("sessions")
		.createIndex({ configId: 1, createdAt: 1, _id: 1 });

	// Admin activity report (manager GET /admin/activity): recent sessions
	await database
		.collection("sessions")
		.createIndex({ updatedAt: 1, configId: 1 });

	// One session start at a time per participant (lib/session-start-lock.ts).
	// Expired locks are cleaned up by TTL; the lock itself checks expiresAt.
	await database
		.collection("session_start_locks")
		.createIndex({ key: 1 }, { unique: true });
	await database
		.collection("session_start_locks")
		.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

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

	await database
		.collection("workspace_documents")
		.createIndex({ groupId: 1 }, { unique: true });
	await database
		.collection("workspace_documents")
		.createIndex({ configId: 1, updatedAt: 1, _id: 1 });
	await database
		.collection("workspace_updates")
		.createIndex({ groupId: 1, createdAt: 1 });
	await database
		.collection("workspace_updates")
		.createIndex({ configId: 1, createdAt: 1, _id: 1 });

	await database
		.collection("timers")
		.createIndex({ scopeKey: 1, timerKey: 1 }, { unique: true });

	console.log("[DB] All indexes ensured");
}
