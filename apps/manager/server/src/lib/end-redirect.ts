/**
 * Pages whose endRedirectUrl is not an http(s) URL. The lab opens it when a
 * participant finishes, so a javascript: or data: URL is refused on upload.
 * Accepts a compiled config (`pages` keyed by id, or a `nodes` list).
 */
export function invalidEndRedirectPages(config: unknown): string[] {
	if (!config || typeof config !== "object") return [];
	const { pages, nodes } = config as { pages?: unknown; nodes?: unknown };
	const list = Array.isArray(nodes)
		? nodes
		: pages && typeof pages === "object"
			? Object.values(pages)
			: [];
	const invalid: string[] = [];
	for (const page of list) {
		if (!page || typeof page !== "object") continue;
		const { id, endRedirectUrl } = page as {
			id?: unknown;
			endRedirectUrl?: unknown;
		};
		if (endRedirectUrl === undefined || endRedirectUrl === null) continue;
		if (typeof endRedirectUrl !== "string" || !isHttpUrl(endRedirectUrl)) {
			invalid.push(typeof id === "string" ? id : "(no id)");
		}
	}
	return invalid;
}

function isHttpUrl(value: string): boolean {
	try {
		const url = new URL(value.trim());
		return url.protocol === "https:" || url.protocol === "http:";
	} catch {
		return false;
	}
}
