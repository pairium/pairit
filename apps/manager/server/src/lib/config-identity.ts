/**
 * Config identity and revisions.
 *
 * A researcher picks a name (unique per owner). On first upload the server
 * assigns a stable random configId, which is the participant link. Later
 * uploads under the same name keep the configId and add a revision.
 */

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const ID_SUFFIX_LENGTH = 10;
const MAX_SLUG_LENGTH = 40;

export function slugifyName(name: string): string {
	const slug = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, MAX_SLUG_LENGTH)
		.replace(/-+$/, "");
	return slug || "config";
}

function randomSuffix(length: number): string {
	// Rejection sampling keeps every character equally likely.
	const limit = 256 - (256 % ID_ALPHABET.length);
	let out = "";
	while (out.length < length) {
		const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
		for (const byte of bytes) {
			if (byte >= limit) continue;
			out += ID_ALPHABET[byte % ID_ALPHABET.length];
			if (out.length === length) break;
		}
	}
	return out;
}

/** `${slug}-${10 random chars}`: about 51 bits, so links are not guessable. */
export function generateConfigId(name: string): string {
	return `${slugifyName(name)}-${randomSuffix(ID_SUFFIX_LENGTH)}`;
}

/**
 * Mongo filter for the sessions that ran one revision. Sessions from before
 * revisions were recorded have no configRevision and always belong to rev 1.
 */
export function revisionSessionFilter(
	revision: number,
): number | { $in: (number | null)[] } {
	return revision === 1 ? { $in: [1, null] } : revision;
}

export type RevisionPlan = {
	revision: number;
	// True when this upload's config should be saved as a new revision.
	bumped: boolean;
	// True when the existing doc predates revisions and should be archived as rev 1.
	archiveLegacy: boolean;
};

export function nextRevision(
	existing: { revision?: number; checksum?: string } | null,
	incomingChecksum: string,
): RevisionPlan {
	if (!existing) {
		return { revision: 1, bumped: true, archiveLegacy: false };
	}
	const legacy = typeof existing.revision !== "number";
	const current = legacy ? 1 : (existing.revision as number);
	if (existing.checksum === incomingChecksum) {
		return { revision: current, bumped: false, archiveLegacy: legacy };
	}
	return { revision: current + 1, bumped: true, archiveLegacy: legacy };
}
