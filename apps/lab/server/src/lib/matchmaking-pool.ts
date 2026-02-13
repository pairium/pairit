/**
 * In-Memory Matchmaking Pool Manager
 * Manages FIFO matchmaking pools for group experiments
 */

import { getGroupsCollection, getSessionsCollection } from "./db";
import { broadcastToSession } from "./sse";

export type PoolConfig = {
	numUsers: number;
	timeoutSeconds: number;
	timeoutTarget?: string;
	assignment?: "random" | "round-robin";
};

export type WaitingEntry = {
	sessionId: string;
	configId: string;
	poolId: string;
	enqueuedAt: number;
	timeoutTimer: ReturnType<typeof setTimeout>;
	poolConfig: PoolConfig;
};

export type EnqueueResult =
	| { status: "waiting"; position: number }
	| { status: "matched"; groupId: string; treatment: string };

// Map<poolKey, WaitingEntry[]> where poolKey = `${configId}:${poolId}`
const pools = new Map<string, WaitingEntry[]>();

// Track session -> poolKey for disconnect cleanup
const sessionPools = new Map<string, string>();

function getPoolKey(configId: string, poolId: string): string {
	return `${configId}:${poolId}`;
}

/**
 * Enqueue a session into the matchmaking pool
 */
export async function enqueueSession(
	sessionId: string,
	configId: string,
	poolId: string,
	poolConfig: PoolConfig,
): Promise<EnqueueResult> {
	const poolKey = getPoolKey(configId, poolId);

	// Get or create pool
	let pool = pools.get(poolKey);
	if (!pool) {
		pool = [];
		pools.set(poolKey, pool);
	}

	// Check if session is already in pool (idempotent)
	const existing = pool.find((e) => e.sessionId === sessionId);
	if (existing) {
		const position = pool.indexOf(existing) + 1;
		return { status: "waiting", position };
	}

	// Create timeout timer
	const timeoutTimer = setTimeout(() => {
		handleTimeout(sessionId, poolKey, poolConfig.timeoutTarget);
	}, poolConfig.timeoutSeconds * 1000);

	// Create entry
	const entry: WaitingEntry = {
		sessionId,
		configId,
		poolId,
		enqueuedAt: Date.now(),
		timeoutTimer,
		poolConfig,
	};

	// Add to pool
	pool.push(entry);
	sessionPools.set(sessionId, poolKey);

	console.log(
		`[Matchmaking] Session ${sessionId} enqueued in pool ${poolKey} (${pool.length}/${poolConfig.numUsers})`,
	);

	// Check if we have enough for a match
	if (pool.length >= poolConfig.numUsers) {
		return await formGroup(pool, poolKey, poolConfig);
	}

	return { status: "waiting", position: pool.length };
}

/**
 * Remove a session from the matchmaking pool
 */
export function removeSession(
	sessionId: string,
	poolId?: string,
): { status: "cancelled" } | { status: "not_found" } {
	const poolKey = poolId
		? sessionPools.get(sessionId) || findPoolKeyForSession(sessionId)
		: sessionPools.get(sessionId);

	if (!poolKey) {
		return { status: "not_found" };
	}

	const pool = pools.get(poolKey);
	if (!pool) {
		return { status: "not_found" };
	}

	const index = pool.findIndex((e) => e.sessionId === sessionId);
	if (index === -1) {
		return { status: "not_found" };
	}

	// Clear timeout and remove entry
	const [entry] = pool.splice(index, 1);
	clearTimeout(entry.timeoutTimer);
	sessionPools.delete(sessionId);

	console.log(
		`[Matchmaking] Session ${sessionId} removed from pool ${poolKey}`,
	);

	// Clean up empty pools
	if (pool.length === 0) {
		pools.delete(poolKey);
	}

	return { status: "cancelled" };
}

/**
 * Handle SSE disconnect - clean up session from any pools
 */
export function handleDisconnect(sessionId: string): void {
	const poolKey = sessionPools.get(sessionId);
	if (poolKey) {
		removeSession(sessionId);
		console.log(
			`[Matchmaking] Session ${sessionId} disconnected, removed from pool`,
		);
	}
}

/**
 * Handle timeout - remove session and notify
 */
function handleTimeout(
	sessionId: string,
	poolKey: string,
	timeoutTarget?: string,
): void {
	const pool = pools.get(poolKey);
	if (!pool) return;

	const index = pool.findIndex((e) => e.sessionId === sessionId);
	if (index === -1) return;

	// Remove entry (timer already fired)
	pool.splice(index, 1);
	sessionPools.delete(sessionId);

	console.log(
		`[Matchmaking] Session ${sessionId} timed out in pool ${poolKey}`,
	);

	// Clean up empty pools
	if (pool.length === 0) {
		pools.delete(poolKey);
	}

	// Broadcast timeout event
	broadcastToSession(sessionId, "match_timeout", {
		poolId: poolKey.split(":")[1],
		timeoutTarget,
	});
}

/**
 * Form a group from waiting entries
 */
async function formGroup(
	pool: WaitingEntry[],
	poolKey: string,
	poolConfig: PoolConfig,
): Promise<EnqueueResult> {
	// Take the required number of entries (FIFO)
	const matchedEntries = pool.splice(0, poolConfig.numUsers);

	// Clear all timeout timers
	for (const entry of matchedEntries) {
		clearTimeout(entry.timeoutTimer);
		sessionPools.delete(entry.sessionId);
	}

	// Generate group ID and treatment
	const groupId = crypto.randomUUID();
	const treatment = assignTreatment(poolConfig.assignment);
	const configId = matchedEntries[0].configId;
	const poolId = matchedEntries[0].poolId;
	const memberSessionIds = matchedEntries.map((e) => e.sessionId);

	console.log(
		`[Matchmaking] Group ${groupId} formed with ${memberSessionIds.length} members, treatment: ${treatment}`,
	);

	// Persist group to MongoDB
	try {
		const groupsCollection = await getGroupsCollection();
		await groupsCollection.insertOne({
			groupId,
			configId,
			poolId,
			memberSessionIds,
			treatment,
			matchedAt: new Date(),
			status: "active",
		});

		// Update each session's user_state
		const sessionsCollection = await getSessionsCollection();
		await Promise.all(
			memberSessionIds.map((sid) =>
				sessionsCollection.updateOne(
					{ id: sid },
					{
						$set: {
							"user_state.group_id": groupId,
							"user_state.chat_group_id": groupId,
							"user_state.treatment": treatment,
							updatedAt: new Date(),
						},
					},
				),
			),
		);
	} catch (error) {
		console.error("[Matchmaking] Failed to persist group:", error);
	}

	// Broadcast match_found to all matched sessions
	for (const entry of matchedEntries) {
		broadcastToSession(entry.sessionId, "match_found", {
			groupId,
			treatment,
			memberCount: memberSessionIds.length,
		});
	}

	// Clean up empty pools
	if (pool.length === 0) {
		pools.delete(poolKey);
	}

	return { status: "matched", groupId, treatment };
}

/**
 * Assign treatment based on assignment strategy
 */
function assignTreatment(assignment?: "random" | "round-robin"): string {
	// Simple implementation: just use "control" or "treatment" randomly
	// Could be extended to support more sophisticated assignment
	if (assignment === "round-robin") {
		// For round-robin, we'd need to track state - simplify to random for now
		return Math.random() < 0.5 ? "control" : "treatment";
	}
	// Default to random
	return Math.random() < 0.5 ? "control" : "treatment";
}

/**
 * Find pool key for a session (fallback search)
 */
function findPoolKeyForSession(sessionId: string): string | undefined {
	for (const [poolKey, pool] of pools.entries()) {
		if (pool.some((e) => e.sessionId === sessionId)) {
			return poolKey;
		}
	}
	return undefined;
}

/**
 * Get current pool status (for debugging)
 */
export function getPoolStatus(): Record<
	string,
	{ count: number; sessions: string[] }
> {
	const status: Record<string, { count: number; sessions: string[] }> = {};
	for (const [poolKey, pool] of pools.entries()) {
		status[poolKey] = {
			count: pool.length,
			sessions: pool.map((e) => e.sessionId),
		};
	}
	return status;
}
