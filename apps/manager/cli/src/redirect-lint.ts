type LintableConfig = {
	pages?: Array<{ id?: string; endRedirectUrl?: unknown }>;
};

/** An absolute http:// or https:// URL. */
export function isHttpUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return url.protocol === "https:" || url.protocol === "http:";
	} catch {
		return false;
	}
}

/**
 * Each page's endRedirectUrl must be an http(s) URL. Participants open it
 * from the lab, so a javascript: or data: URL is refused.
 */
export function lintEndRedirectUrls(config: LintableConfig): string[] {
	if (!Array.isArray(config.pages)) return [];
	const errors: string[] = [];
	config.pages.forEach((page, index) => {
		const url = page?.endRedirectUrl;
		if (url === undefined || url === null) return;
		if (typeof url !== "string" || !isHttpUrl(url.trim())) {
			const where = page.id ? `page "${page.id}"` : `pages[${index}]`;
			errors.push(
				`${where}: endRedirectUrl must be an http:// or https:// URL`,
			);
		}
	});
	return errors;
}
