/**
 * Provenance recorded on every session: which config revision and which lab
 * build served it. Researchers use it to split data across mid-study changes.
 */

export type Provenance = {
	configRevision: number | null;
	configChecksum: string | null;
	labVersion: string | null;
	labRevision: string | null;
};

export function buildProvenance(
	config: { revision?: number; checksum?: string } | null,
	env: Record<string, string | undefined> = process.env,
): Provenance {
	return {
		configRevision:
			typeof config?.revision === "number" ? config.revision : null,
		configChecksum: config?.checksum ?? null,
		// GIT_SHA is set by scripts/deploy.sh; local dev has none
		labVersion: env.GIT_SHA || "dev",
		// Cloud Run sets K_REVISION on every deployed revision
		labRevision: env.K_REVISION || null,
	};
}
