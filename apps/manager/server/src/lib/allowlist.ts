/**
 * Manager allowlist: gates who may sign in to the manager API.
 *
 * Collection shape (`allowed_users`):
 *   { email: string, isAdmin: boolean, addedBy: string, addedAt: Date }
 *
 * Emails are stored lowercased to match Better Auth's normalization.
 */

import { connectDB } from "@pairit/db";
import type { Collection } from "mongodb";

export type AllowedUser = {
	email: string;
	isAdmin: boolean;
	addedBy: string;
	addedAt: Date;
};

const COLLECTION = "allowed_users";

export function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

export async function getAllowlistCollection(): Promise<
	Collection<AllowedUser>
> {
	const db = await connectDB();
	return db.collection<AllowedUser>(COLLECTION);
}

export async function ensureAllowlistIndexes(): Promise<void> {
	const collection = await getAllowlistCollection();
	await collection.createIndex({ email: 1 }, { unique: true });
}

export async function findAllowed(email: string): Promise<AllowedUser | null> {
	const collection = await getAllowlistCollection();
	return collection.findOne({ email: normalizeEmail(email) });
}

export async function isAllowed(email: string): Promise<boolean> {
	return (await findAllowed(email)) !== null;
}

export async function isAdmin(email: string): Promise<boolean> {
	const entry = await findAllowed(email);
	return entry?.isAdmin === true;
}

export async function addUser(input: {
	email: string;
	isAdmin: boolean;
	addedBy: string;
}): Promise<AllowedUser> {
	const collection = await getAllowlistCollection();
	const doc: AllowedUser = {
		email: normalizeEmail(input.email),
		isAdmin: input.isAdmin,
		addedBy: input.addedBy,
		addedAt: new Date(),
	};
	await collection.updateOne(
		{ email: doc.email },
		{
			$setOnInsert: {
				email: doc.email,
				addedBy: doc.addedBy,
				addedAt: doc.addedAt,
			},
			$set: { isAdmin: doc.isAdmin },
		},
		{ upsert: true },
	);
	const stored = await collection.findOne({ email: doc.email });
	if (!stored)
		throw new Error(`Failed to upsert allowlist entry for ${doc.email}`);
	return stored;
}

export async function removeUser(email: string): Promise<boolean> {
	const collection = await getAllowlistCollection();
	const result = await collection.deleteOne({ email: normalizeEmail(email) });
	return result.deletedCount > 0;
}

export async function listUsers(): Promise<AllowedUser[]> {
	const collection = await getAllowlistCollection();
	return collection.find({}, { sort: { addedAt: 1 } }).toArray();
}
