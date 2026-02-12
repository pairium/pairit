/**
 * MongoDB connection for manager server
 * Uses shared @pairit/db module for singleton connection
 */

import { connectDB } from "@pairit/db";
import type { Collection } from "mongodb";
import type { ConfigDocument } from "../types";

export { closeDB, connectDB } from "@pairit/db";

export async function getConfigsCollection(): Promise<
	Collection<ConfigDocument>
> {
	const database = await connectDB();
	return database.collection<ConfigDocument>("configs");
}
