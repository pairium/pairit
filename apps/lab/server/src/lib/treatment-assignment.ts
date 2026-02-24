/**
 * Treatment Assignment Module
 * Shared logic for assigning participants to experimental conditions.
 * Counts are rebuilt from existing session data on first use per balance key,
 * so state survives server restarts.
 */

import { getSessionsCollection } from "./db";

export type AssignmentType = "random" | "balanced_random" | "block";

// Track condition counts per balance key for balanced_random
const conditionCounts = new Map<string, Map<string, number>>();

// Track block position per balance key for block randomization
const blockPositions = new Map<string, number>();

// Track which balance keys have been initialized from DB
const initialized = new Set<string>();

/**
 * Rebuild condition counts and block positions from existing sessions.
 * Called once per balance key on first use after server start.
 * Balance key format: "configId:stateKey"
 */
async function rebuildFromSessions(
	balanceKey: string,
	conditions: string[],
): Promise<void> {
	if (initialized.has(balanceKey)) return;
	initialized.add(balanceKey);

	const [configId, stateKey] = balanceKey.split(":");
	if (!configId || !stateKey) return;

	const collection = await getSessionsCollection();
	const sessions = await collection
		.find(
			{ configId, [`user_state.${stateKey}`]: { $exists: true } },
			{ projection: { [`user_state.${stateKey}`]: 1 } },
		)
		.toArray();

	const counts = new Map(conditions.map((c) => [c, 0]));
	for (const session of sessions) {
		const value = session.user_state?.[stateKey] as string;
		if (value && counts.has(value)) {
			counts.set(value, (counts.get(value) ?? 0) + 1);
		}
	}

	conditionCounts.set(balanceKey, counts);
	blockPositions.set(balanceKey, sessions.length);
}

/**
 * Assign treatment based on assignment strategy
 * @param balanceKey - Key to track balance across (e.g., "configId:stateKey")
 * @param conditions - Array of condition names (defaults to ["control", "treatment"])
 * @param assignmentType - Strategy: "random", "balanced_random", or "block"
 */
export async function assignTreatment(
	balanceKey: string,
	conditions: string[],
	assignmentType: AssignmentType = "random",
): Promise<string> {
	const opts = conditions.length ? conditions : ["control", "treatment"];

	if (assignmentType === "random") {
		return opts[Math.floor(Math.random() * opts.length)];
	}

	// Rebuild counts from DB on first use
	await rebuildFromSessions(balanceKey, opts);

	if (assignmentType === "balanced_random") {
		// Pick condition with lowest count
		let counts = conditionCounts.get(balanceKey);
		if (!counts) {
			counts = new Map(opts.map((c) => [c, 0]));
			conditionCounts.set(balanceKey, counts);
		}
		const minCount = Math.min(...opts.map((c) => counts.get(c) ?? 0));
		const candidates = opts.filter((c) => (counts.get(c) ?? 0) === minCount);
		const chosen = candidates[Math.floor(Math.random() * candidates.length)];
		counts.set(chosen, (counts.get(chosen) ?? 0) + 1);
		return chosen;
	}

	if (assignmentType === "block") {
		// Round-robin through conditions in order
		const pos = blockPositions.get(balanceKey) ?? 0;
		const chosen = opts[pos % opts.length];
		blockPositions.set(balanceKey, pos + 1);
		return chosen;
	}

	return opts[0];
}

/**
 * Get current condition counts for a balance key (for debugging)
 */
export function getConditionCounts(
	balanceKey: string,
): Record<string, number> | null {
	const counts = conditionCounts.get(balanceKey);
	if (!counts) return null;
	return Object.fromEntries(counts);
}

/**
 * Get current block position for a balance key (for debugging)
 */
export function getBlockPosition(balanceKey: string): number | null {
	return blockPositions.get(balanceKey) ?? null;
}
