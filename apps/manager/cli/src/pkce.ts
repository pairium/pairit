import { createHash, randomBytes } from "node:crypto";

/** Login parameters for one `pairit login` (RFC 7636 PKCE, S256). */
export type LoginSecrets = {
	state: string;
	codeVerifier: string;
	codeChallenge: string;
};

export function createLoginSecrets(): LoginSecrets {
	const codeVerifier = randomBytes(32).toString("base64url");
	return {
		state: randomBytes(24).toString("base64url"),
		codeVerifier,
		codeChallenge: createHash("sha256")
			.update(codeVerifier)
			.digest("base64url"),
	};
}

/** Query params the manager's /login page passes on to /login-success. */
export function loginParams(secrets: LoginSecrets | null): URLSearchParams {
	const params = new URLSearchParams();
	if (secrets) {
		params.set("state", secrets.state);
		params.set("code_challenge", secrets.codeChallenge);
		params.set("code_challenge_method", "S256");
	}
	return params;
}

/**
 * Check a request to the CLI's loopback server. With secrets, the `state`
 * must match the one this login sent, so a page that guesses the port can't
 * hand the CLI someone else's code.
 */
export function readLoopbackCallback(
	url: URL,
	secrets: LoginSecrets | null,
): { code: string } | { error: string } {
	const code = url.searchParams.get("code");
	if (!code) return { error: "Missing authorization code" };
	if (secrets && url.searchParams.get("state") !== secrets.state) {
		return { error: "State mismatch" };
	}
	return { code };
}
