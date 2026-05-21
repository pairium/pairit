/**
 * Cursor pagination helpers for /data/* export endpoints.
 *
 * Cursor wire format: `<sortField-ISO-8601>,<_id-hex>` — exclusive.
 * Tiebreaker on _id handles equal-timestamp rows. Sort becomes
 * `{ [sortField]: 1, _id: 1 }` to make the cursor deterministic.
 */

import { ObjectId } from "mongodb";

const DEFAULT_LIMIT = 5000;
const MAX_LIMIT = 20000;

export type Cursor = { sortValue: Date; id: ObjectId };

export class CursorError extends Error {}

export function parseCursor(since: string | undefined): Cursor | null {
	if (!since) return null;
	const idx = since.lastIndexOf(",");
	if (idx < 0) throw new CursorError("invalid cursor format");
	const iso = since.slice(0, idx);
	const idHex = since.slice(idx + 1);
	const sortValue = new Date(iso);
	if (Number.isNaN(sortValue.getTime())) {
		throw new CursorError("invalid cursor timestamp");
	}
	if (!ObjectId.isValid(idHex)) {
		throw new CursorError("invalid cursor id");
	}
	return { sortValue, id: new ObjectId(idHex) };
}

export function parseLimit(limit: string | undefined): number {
	if (!limit) return DEFAULT_LIMIT;
	const n = Number.parseInt(limit, 10);
	if (Number.isNaN(n) || n < 1) {
		throw new CursorError("invalid limit");
	}
	return Math.min(n, MAX_LIMIT);
}

export function cursorFilter(
	sortField: string,
	cursor: Cursor | null,
): Record<string, unknown> {
	if (!cursor) return {};
	return {
		$or: [
			{ [sortField]: { $gt: cursor.sortValue } },
			{ [sortField]: cursor.sortValue, _id: { $gt: cursor.id } },
		],
	};
}

export function encodeCursor(sortValue: Date, id: ObjectId): string {
	return `${sortValue.toISOString()},${id.toHexString()}`;
}
