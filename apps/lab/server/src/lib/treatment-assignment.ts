/**
 * Treatment Assignment Module
 * Shared logic for assigning participants to experimental conditions
 */

export type AssignmentType = "random" | "balanced_random" | "block";

// Track condition counts per balance key for balanced_random
const conditionCounts = new Map<string, Map<string, number>>();

// Track block position per balance key for block randomization
const blockPositions = new Map<string, number>();

/**
 * Assign treatment based on assignment strategy
 * @param balanceKey - Key to track balance across (e.g., configId or poolKey)
 * @param conditions - Array of condition names (defaults to ["control", "treatment"])
 * @param assignmentType - Strategy: "random", "balanced_random", or "block"
 */
export function assignTreatment(
	balanceKey: string,
	conditions: string[],
	assignmentType: AssignmentType = "random",
): string {
	const opts = conditions.length ? conditions : ["control", "treatment"];

	if (assignmentType === "random") {
		return opts[Math.floor(Math.random() * opts.length)];
	}

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
