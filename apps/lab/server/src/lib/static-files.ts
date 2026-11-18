/**
 * Static file helpers for the production lab server
 */

import { stat } from "node:fs/promises";
import { resolve, sep } from "node:path";

/**
 * The file `relative` names inside `dir`, or null if it would leave `dir`.
 * A plain prefix check would also accept siblings such as `assets-old/`.
 */
export function containedPath(dir: string, relative: string): string | null {
	const root = resolve(dir);
	const full = resolve(root, relative);
	return full.startsWith(root + sep) ? full : null;
}

/** A regular file inside `dir`, or null (missing, a directory, or outside). */
export async function staticFile(
	dir: string,
	relative: string,
): Promise<string | null> {
	const full = containedPath(dir, relative);
	if (!full) return null;
	try {
		return (await stat(full)).isFile() ? full : null;
	} catch {
		return null;
	}
}

// The lab is never framed by another site, and its URLs carry Prolific IDs
// that should not leak to other sites through the Referer header.
export const HTML_SECURITY_HEADERS: Record<string, string> = {
	"Content-Security-Policy": "frame-ancestors 'none'",
	"X-Frame-Options": "DENY",
	"Referrer-Policy": "no-referrer",
	"X-Content-Type-Options": "nosniff",
};
