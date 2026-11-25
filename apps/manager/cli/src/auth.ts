import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { getApiUrl, getCredentialKey } from "./env.js";
import {
	createLoginSecrets,
	type LoginSecrets,
	loginParams,
	readLoopbackCallback,
} from "./pkce.js";

const CONFIG_DIR = join(homedir(), ".pairit");

function getCredentialsFile(): string {
	const key = getCredentialKey();
	return join(
		CONFIG_DIR,
		key === "default"
			? "credentials.json"
			: `credentials-${key.replace(/[^a-zA-Z0-9.-]/g, "_")}.json`,
	);
}
const CREDENTIALS_BACKEND =
	process.env.PAIRIT_CREDENTIALS_BACKEND || "keychain";
const KEYCHAIN_SERVICE = "pairit-cli";
const KEYRING_MODULE_SPECIFIER = "@napi-rs/keyring";

/**
 * Whether the manager checks state and PKCE. Servers from before the check
 * don't have this endpoint; the CLI then logs in the old way.
 */
async function serverSupportsPkce(): Promise<boolean> {
	try {
		const response = await fetch(`${getApiUrl()}/api/cli/login-info`, {
			signal: AbortSignal.timeout(10_000),
		});
		if (!response.ok) return false;
		const info = (await response.json()) as {
			codeChallengeMethods?: unknown;
		};
		return (
			Array.isArray(info.codeChallengeMethods) &&
			info.codeChallengeMethods.includes("S256")
		);
	} catch {
		return false;
	}
}

/**
 * Exchange an authorization code for a session token
 */
async function exchangeCodeForToken(
	code: string,
	secrets: LoginSecrets | null,
): Promise<string> {
	const response = await fetch(`${getApiUrl()}/api/cli/exchange`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			code,
			...(secrets && { code_verifier: secrets.codeVerifier }),
		}),
	});

	if (!response.ok) {
		const error = await response
			.json()
			.catch(() => ({ message: "Unknown error" }));
		throw new Error(
			`Failed to exchange code: ${error.message || response.statusText}`,
		);
	}

	const data = await response.json();
	if (!data.token) {
		throw new Error("No token in exchange response");
	}
	return data.token;
}

export async function login() {
	console.log(`Initiating login to ${getApiUrl()}...`);

	const loginUrl = `${getApiUrl()}/login`;
	const secrets = (await serverSupportsPkce()) ? createLoginSecrets() : null;
	if (!secrets) {
		console.warn(
			"This server predates state/PKCE checks; using the older login handoff.",
		);
	}
	const manualParams = loginParams(secrets);
	manualParams.set("manual", "1");
	const manualLoginUrl = `${loginUrl}?${manualParams}`;

	// Try automated loopback flow when a local browser is likely available
	if (canAttemptBrowserLogin()) {
		try {
			const { createServer } = await import("node:http");
			const { default: open } = await import("open");

			const server = createServer();
			const port = await new Promise<number>((resolve, reject) => {
				server.listen(0, "127.0.0.1", () => {
					const address = server.address();
					if (address && typeof address === "object") {
						resolve(address.port);
					} else {
						reject(new Error("Could not determine port"));
					}
				});
			});

			const redirectUri = `http://127.0.0.1:${port}`;
			const targetParams = loginParams(secrets);
			targetParams.set("cli_redirect_uri", redirectUri);
			const targetUrl = `${loginUrl}?${targetParams}`;

			console.log(`Opening ${loginUrl} in your browser...`);
			await open(targetUrl);

			console.log("Waiting for sign-in to complete...");

			// Receive authorization code (not the token directly for security)
			const authCode = await new Promise<string>((resolve, reject) => {
				// Set 2 minute timeout
				const timeout = setTimeout(() => {
					server.close();
					reject(new Error("Login timed out"));
				}, 120000);

				server.on("request", (req, res) => {
					try {
						const url = new URL(req.url || "/", "http://127.0.0.1");
						const result = readLoopbackCallback(url, secrets);

						if ("code" in result) {
							const { code } = result;
							res.writeHead(200, { "Content-Type": "text/html" });
							res.end(
								`<!DOCTYPE html><html><head><title>Login Successful</title></head><body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h1>Authenticated!</h1><p>You can close this window and return to your CLI.</p></div><script>setTimeout(()=>window.close(),3000)</script></body></html>`,
							);
							clearTimeout(timeout);
							server.close();
							resolve(code);
						} else {
							// Keep waiting: a stray or forged request doesn't end the login
							res.writeHead(400);
							res.end(result.error);
						}
					} catch (_e) {
						res.writeHead(500);
						res.end("Error processing request");
					}
				});
			});

			// Exchange the authorization code for a session token
			console.log("Exchanging authorization code for token...");
			const token = await exchangeCodeForToken(authCode, secrets);

			await saveCredentials({ token });
			console.log("Successfully logged in!");
			return;
		} catch (error) {
			console.warn(
				"Automated login failed, falling back to manual entry:",
				error instanceof Error ? error.message : String(error),
			);
		}
	}

	// Fallback Manual Flow
	console.log(`
Open this URL in a browser on any machine:
${manualLoginUrl}

After signing in, the page will show a one-time authorization code.
Paste that code here to complete CLI login.
`);

	const code = await prompt("Enter authorization code: ");
	if (!code) {
		console.error("No authorization code provided");
		process.exit(1);
	}

	const token = await exchangeCodeForToken(code, secrets);
	await saveCredentials({ token });
	console.log("Successfully logged in!");
}

export async function getAuthHeaders(): Promise<HeadersInit> {
	try {
		const creds = await getCredentials();
		if (creds?.cookie) {
			return { Cookie: creds.cookie };
		}
		if (creds?.token) {
			// Both cookie names needed: standard for HTTP, __Secure- for HTTPS
			return {
				Cookie: `better-auth.session_token=${creds.token}; __Secure-better-auth.session_token=${creds.token}`,
			};
		}
	} catch {
		// ignore missing credentials
	}
	return {};
}

async function saveCredentials(creds: { token?: string; cookie?: string }) {
	if (CREDENTIALS_BACKEND !== "file") {
		const entry = await loadKeyringEntry();
		if (entry) {
			try {
				await entry.setPassword(JSON.stringify(creds));
				return;
			} catch {
				// Fall back to the 0600 file if the OS keychain is locked or unavailable.
			}
		}
	}

	await writeCredentialsFile(
		CONFIG_DIR,
		getCredentialsFile(),
		JSON.stringify(creds, null, 2),
	);
}

/**
 * Write a credentials file readable only by the user: the directory is 0700
 * and the file 0600, including ones made by older versions with looser modes.
 */
export async function writeCredentialsFile(
	dir: string,
	file: string,
	contents: string,
): Promise<void> {
	await mkdir(dir, { recursive: true, mode: 0o700 });
	await chmod(dir, 0o700);
	await writeFile(file, contents, { mode: 0o600 });
	// `mode` only applies when the file is created
	await chmod(file, 0o600);
}

async function getCredentials(): Promise<{
	token?: string;
	cookie?: string;
} | null> {
	if (CREDENTIALS_BACKEND !== "file") {
		const entry = await loadKeyringEntry();
		if (entry) {
			try {
				const stored = await entry.getPassword();
				if (stored) {
					try {
						return JSON.parse(stored) as { token?: string; cookie?: string };
					} catch {
						return null;
					}
				}
			} catch {
				// Fall back to the credentials file if the OS keychain cannot be read.
			}
		}
	}

	try {
		const file = getCredentialsFile();
		const data = await readFile(file, "utf8");
		// Tighten files saved by older versions
		await chmod(file, 0o600).catch(() => {});
		return JSON.parse(data);
	} catch {
		return null;
	}
}

async function prompt(question: string): Promise<string> {
	const readline = await import("node:readline");
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	return new Promise((resolve) => {
		rl.question(question, (answer) => {
			rl.close();
			resolve(answer.trim());
		});
	});
}

function canAttemptBrowserLogin(): boolean {
	if (!process.stdout.isTTY || !process.stdin.isTTY) {
		return false;
	}

	if (
		process.env.SSH_CONNECTION ||
		process.env.SSH_CLIENT ||
		process.env.SSH_TTY
	) {
		return false;
	}

	return (
		process.platform === "darwin" ||
		process.platform === "win32" ||
		Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY)
	);
}

type KeyringEntry = {
	setPassword: (password: string) => Promise<void>;
	getPassword: () => Promise<string | null>;
};

type KeyringModule = {
	AsyncEntry?: new (
		service: string,
		username: string,
		options?: { linux?: { store?: "secret-service" | "keyutils" } },
	) => KeyringEntry;
};

async function loadKeyringEntry(): Promise<KeyringEntry | null> {
	try {
		// Avoid static resolution/bundling of optional native dependency.
		const runtimeImport = new Function("s", "return import(s)") as (
			s: string,
		) => Promise<unknown>;
		const mod = (await runtimeImport(KEYRING_MODULE_SPECIFIER)) as
			| (KeyringModule & { default?: KeyringModule })
			| null;
		const AsyncEntry = mod?.AsyncEntry ?? mod?.default?.AsyncEntry;
		if (!AsyncEntry) return null;
		// Require Secret Service on Linux so headless hosts fall back to the 0600
		// file instead of the ephemeral kernel keyutils store.
		return new AsyncEntry(KEYCHAIN_SERVICE, getCredentialKey(), {
			linux: { store: "secret-service" },
		});
	} catch {
		return null;
	}
}
