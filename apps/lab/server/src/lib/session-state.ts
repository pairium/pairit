// MongoDB rejects one $set that touches both "a" and "a.b".
export function hasOverlappingPaths(paths: string[]): boolean {
	const sorted = [...paths].sort();
	for (let i = 1; i < sorted.length; i++) {
		if (sorted[i].startsWith(`${sorted[i - 1]}.`)) return true;
	}
	return false;
}
