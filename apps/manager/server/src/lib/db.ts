/**
 * MongoDB connection for manager server
 * Uses shared @pairit/db module for singleton connection
 */

import { connectDB } from "@pairit/db";
import type { Collection } from "mongodb";
import type {
	ChatMessageDocument,
	ConfigDocument,
	EventDocument,
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

export async function getChatMessagesCollection(): Promise<
	Collection<ChatMessageDocument>
> {
	const database = await connectDB();
	return database.collection<ChatMessageDocument>("chat_messages");
}
