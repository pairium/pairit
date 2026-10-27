/**
 * Serializes session starts per participant, so two overlapping
 * POST /sessions/start calls (React StrictMode in dev, two tabs, a quick
 * reload) resume one session instead of each creating their own.
 *
 * A lock is a doc in `session_start_locks` with a unique `key`. Taking it
 * is one upsert: it matches only an expired lock, so a live one makes the
 * insert fail on the unique index. Locks expire, so a crashed holder can't
 * block a participant for long.
 */
import { randomUUID } from "node:crypto";
import { type Collection, MongoServerError } from "mongodb";

export type StartLock = {
	key: string;
	token: string;
	expiresAt: Date;
};

export type StartLockStore = Pick<
	Collection<StartLock>,
	"updateOne" | "deleteOne"
>;

// Long enough for a find-or-create (a few queries), short enough that a
// crashed holder only delays the participant briefly.
export const LOCK_TTL_MS = 10_000;
export const LOCK_WAIT_MS = 5_000;
const RETRY_MS = 50;

/** Lock key for a participant's sessions of one config, or null if anonymous. */
export function startLockKey(
	configId: string,
	identity: { prolificPid: string | null; userId: string | null },
): string | null {
	// Same priority as findExistingSession: Prolific PID, then OAuth user
	if (identity.prolificPid) {
		return `${configId}:prolific:${identity.prolificPid}`;
	}
	if (identity.userId) return `${configId}:user:${identity.userId}`;
	return null;
}

async function acquire(
	store: StartLockStore,
	key: string,
	now: Date,
): Promise<string | null> {
	const token = randomUUID();
	try {
		await store.updateOne(
			{ key, expiresAt: { $lte: now } },
			{ $set: { token, expiresAt: new Date(now.getTime() + LOCK_TTL_MS) } },
			{ upsert: true },
		);
		return token;
	} catch (err) {
		if (err instanceof MongoServerError && err.code === 11000) return null;
		throw err;
	}
}

/**
 * Run `fn` while holding the lock for `key`. Waits up to LOCK_WAIT_MS for
 * another holder; after that runs `fn` anyway, since a duplicate session is
 * better than a participant who cannot start.
 */
export async function withStartLock<T>(
	store: StartLockStore,
	key: string,
	fn: () => Promise<T>,
	options: { waitMs?: number; now?: () => Date } = {},
): Promise<T> {
	const now = options.now ?? (() => new Date());
	const deadline = now().getTime() + (options.waitMs ?? LOCK_WAIT_MS);
	let token = await acquire(store, key, now());
	while (!token && now().getTime() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
		token = await acquire(store, key, now());
	}
	if (!token) {
		console.warn(`[Sessions] Start lock ${key} still held; starting anyway`);
		return fn();
	}
	try {
		return await fn();
	} finally {
		await store.deleteOne({ key, token });
	}
}
