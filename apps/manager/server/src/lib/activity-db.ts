/**
 * Reads what the admin activity report needs. Every query is bounded by an
 * index: sessions { updatedAt, configId } (lab server ensureIndexes),
 * { configId, createdAt, _id } and { "prolific.prolificPid", configId, createdAt }.
 */
import { ObjectId } from "mongodb";
import type { ConfigDocument } from "../types";
import {
	ACTIVE_WINDOW_MS,
	type ActiveSession,
	type ActivityInput,
	type SessionCounts,
	STARTED_TODAY_MS,
} from "./activity";
import { connectDB, getConfigsCollection, getSessionsCollection } from "./db";

export async function loadActivityInput(
	since: Date,
	now: Date,
): Promise<ActivityInput> {
	const sessions = await getSessionsCollection();

	const recent = await sessions
		.aggregate<{ _id: string; lastActivityAt: Date }>([
			{ $match: { updatedAt: { $gte: since } } },
			{ $group: { _id: "$configId", lastActivityAt: { $max: "$updatedAt" } } },
		])
		.toArray();
	const lastActivity = new Map(recent.map((r) => [r._id, r.lastActivityAt]));

	const activeSessions = (await sessions
		.find(
			{
				updatedAt: { $gte: new Date(now.getTime() - ACTIVE_WINDOW_MS) },
				endedAt: null,
			},
			{
				projection: {
					_id: 0,
					configId: 1,
					currentPageId: 1,
					"session_state.chat_group_id": 1,
					"config.pages": 1,
				},
			},
		)
		.toArray()) as ActiveSession[];

	const configIds = [
		...new Set([
			...lastActivity.keys(),
			...activeSessions.map((s) => s.configId),
		]),
	];

	const configsCollection = await getConfigsCollection();
	const configDocs = await configsCollection
		.find(
			{ configId: { $in: configIds } },
			{ projection: { llmCredentials: 0 } },
		)
		.toArray();
	const configs = new Map<string, ConfigDocument>(
		configDocs.map((doc) => [doc.configId, doc]),
	);

	const startedSince = new Date(now.getTime() - STARTED_TODAY_MS);
	const counts = new Map<string, SessionCounts>();
	await Promise.all(
		configIds.map(async (configId) => {
			const [total, startedToday, prolific] = await Promise.all([
				sessions.countDocuments({ configId }),
				sessions.countDocuments({
					configId,
					createdAt: { $gte: startedSince },
				}),
				sessions.countDocuments({
					"prolific.prolificPid": { $type: "string" },
					configId,
				}),
			]);
			counts.set(configId, { total, startedToday, prolific });
		}),
	);

	const ownerEmails = await loadOwnerEmails(configDocs.map((doc) => doc.owner));

	return {
		now,
		since,
		lastActivity,
		configs,
		ownerEmails,
		activeSessions,
		counts,
	};
}

// Better Auth stores users in `user`, keyed by ObjectId; configs store the id
// as a string. Same lookup as the allowlist migration.
async function loadOwnerEmails(
	ownerIds: (string | undefined)[],
): Promise<Map<string, string>> {
	const objectIds = [...new Set(ownerIds)]
		.filter(
			(id): id is string => typeof id === "string" && ObjectId.isValid(id),
		)
		.map((id) => new ObjectId(id));
	if (objectIds.length === 0) return new Map();

	const db = await connectDB();
	const users = await db
		.collection<{ email?: string }>("user")
		.find({ _id: { $in: objectIds } }, { projection: { email: 1 } })
		.toArray();
	const emails = new Map<string, string>();
	for (const user of users) {
		if (user.email) emails.set(user._id.toHexString(), user.email);
	}
	return emails;
}
