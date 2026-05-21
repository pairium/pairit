/**
 * Manager allowlist bootstrap routines.
 *
 * - bootstrapAdmin: seeds MANAGER_BOOTSTRAP_ADMIN_EMAIL as an admin if set.
 * - migrateExistingResearchers: on first run, copies every distinct config
 *   owner into `allowed_users`. We use config ownership as the signal that a
 *   user is a researcher; the `user` collection itself is shared with lab
 *   participants and can't be migrated wholesale.
 */

import { connectDB } from "@pairit/db";
import { ObjectId } from "mongodb";
import {
	addUser,
	ensureAllowlistIndexes,
	findAllowed,
	getAllowlistCollection,
	normalizeEmail,
} from "./allowlist";

async function bootstrapAdmin(): Promise<void> {
	const email = process.env.MANAGER_BOOTSTRAP_ADMIN_EMAIL;
	if (!email) {
		console.warn(
			"[Allowlist] MANAGER_BOOTSTRAP_ADMIN_EMAIL not set; no admin will be seeded",
		);
		return;
	}

	const normalized = normalizeEmail(email);
	const existing = await findAllowed(normalized);
	if (existing?.isAdmin) {
		console.log(`[Allowlist] Admin ${normalized} already present`);
		return;
	}

	await addUser({ email: normalized, isAdmin: true, addedBy: "bootstrap" });
	console.log(`[Allowlist] Seeded admin ${normalized}`);
}

async function migrateExistingResearchers(): Promise<void> {
	const db = await connectDB();
	const allowlistCollection = await getAllowlistCollection();

	const allowlistCount = await allowlistCollection.estimatedDocumentCount();
	if (allowlistCount > 0) return;

	const ownerIds = (await db
		.collection("configs")
		.distinct("owner")) as unknown[];
	const objectIds: ObjectId[] = [];
	for (const id of ownerIds) {
		if (typeof id !== "string" || !ObjectId.isValid(id)) continue;
		objectIds.push(new ObjectId(id));
	}
	if (objectIds.length === 0) return;

	const users = await db
		.collection<{ email?: string }>("user")
		.find({ _id: { $in: objectIds } }, { projection: { email: 1 } })
		.toArray();

	let migrated = 0;
	for (const user of users) {
		if (!user.email) continue;
		await addUser({
			email: user.email,
			isAdmin: false,
			addedBy: "migration",
		});
		migrated++;
	}

	if (migrated > 0) {
		console.log(
			`[Allowlist] Migrated ${migrated} researcher(s) (config owners) onto the allowlist`,
		);
	}
}

export async function initAllowlist(): Promise<void> {
	await ensureAllowlistIndexes();
	await migrateExistingResearchers();
	await bootstrapAdmin();
}
