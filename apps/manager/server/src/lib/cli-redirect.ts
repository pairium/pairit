const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost"]);

/**
 * Parse the CLI's loopback redirect URI. Only `http://127.0.0.1:<port>` or
 * `http://localhost:<port>` pass: anything else (another scheme such as
 * `javascript://localhost/...`, credentials, no port) returns null.
 */
export function validateCliRedirect(raw: unknown): URL | null {
	if (typeof raw !== "string" || raw.length === 0) return null;

	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return null;
	}

	if (url.protocol !== "http:") return null;
	if (!LOOPBACK_HOSTS.has(url.hostname)) return null;
	if (url.username !== "" || url.password !== "") return null;

	const port = Number(url.port);
	if (!Number.isInteger(port) || port < 1 || port > 65535) return null;

	return url;
}
