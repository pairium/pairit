/**
 * The end page's "Continue" link. Only http(s) URLs are followed: a
 * javascript: or data: URL would run in the lab's own origin.
 */
export function safeRedirectUrl(value: unknown): string | null {
	if (typeof value !== "string" || !value.trim()) return null;
	try {
		const url = new URL(value.trim());
		if (url.protocol !== "https:" && url.protocol !== "http:") return null;
		return url.href;
	} catch {
		return null;
	}
}

const PROLIFIC_DOMAINS = ["prolific.com", "prolific.co"];

/** True only for prolific.com, prolific.co and their subdomains. */
export function isProlificUrl(value: string): boolean {
	try {
		const host = new URL(value).hostname.toLowerCase();
		return PROLIFIC_DOMAINS.some(
			(domain) => host === domain || host.endsWith(`.${domain}`),
		);
	} catch {
		return false;
	}
}
