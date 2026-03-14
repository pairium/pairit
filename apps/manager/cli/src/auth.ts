import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".pairit");
const CREDENTIALS_FILE = join(CONFIG_DIR, "credentials.json");
const CREDENTIALS_BACKEND =
	process.env.PAIRIT_CREDENTIALS_BACKEND || "keychain";
const KEYCHAIN_SERVICE = "pairit-cli";
const KEYCHAIN_ACCOUNT = "default";
const KEYTAR_MODULE_SPECIFIER = "keytar";

const BASE_URL =
	process.env.PAIRIT_API_URL ||
	"https://manager-432501290611.us-central1.run.app";

/**
 * Exchange an authorization code for a session token
 */
async function exchangeCodeForToken(code: string): Promise<string> {
	const response = await fetch(`${BASE_URL}/api/cli/exchange`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ code }),
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
	console.log("Initiating login...");

	const loginUrl = `${BASE_URL}/login`;
	const manualLoginUrl = `${loginUrl}?manual=1`;

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
		const targetUrl = `${loginUrl}?cli_redirect_uri=${encodeURIComponent(redirectUri)}`;

		console.log("Opening browser for authentication...");
		await open(targetUrl);

		console.log(`Waiting for authentication at ${redirectUri}...`);

		// Receive authorization code (not the token directly for security)
		const authCode = await new Promise<string>((resolve, reject) => {
			// Set 2 minute timeout
			const timeout = setTimeout(() => {
				server.close();
				reject(new Error("Login timed out"));
			}, 120000);

			server.on("request", (req, res) => {
				try {
					const url = new URL(req.url || "/", `http://${req.headers.host}`);
					const code = url.searchParams.get("code");

					if (code) {
						res.writeHead(200, { "Content-Type": "text/html" });
						res.end(
							`<!DOCTYPE html><html><head><title>Login Successful</title></head><body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h1>Authenticated!</h1><p>You can close this window and return to your CLI.</p></div><script>setTimeout(()=>window.close(),3000)</script></body></html>`,
						);
						clearTimeout(timeout);
						server.close();
						resolve(code);
					} else {
						res.writeHead(400);
						res.end("Missing authorization code");
					}
				} catch (_e) {
					res.writeHead(500);
					res.end("Error processing request");
				}
			});
		});

		// Exchange the authorization code for a session token
		console.log("Exchanging authorization code for token...");
		const token = await exchangeCodeForToken(authCode);

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

	const token = await exchangeCodeForToken(code);
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
		const keytar = await loadKeytar();
		if (keytar) {
			await keytar.setPassword(
				KEYCHAIN_SERVICE,
				KEYCHAIN_ACCOUNT,
				JSON.stringify(creds),
			);
			return;
		}
	}

	await mkdir(CONFIG_DIR, { recursive: true });
	await writeFile(CREDENTIALS_FILE, JSON.stringify(creds, null, 2), {
		mode: 0o600,
	});
}

async function getCredentials(): Promise<{
	token?: string;
	cookie?: string;
} | null> {
	if (CREDENTIALS_BACKEND !== "file") {
		const keytar = await loadKeytar();
		if (keytar) {
			const stored = await keytar.getPassword(
				KEYCHAIN_SERVICE,
				KEYCHAIN_ACCOUNT,
			);
			if (stored) {
				try {
					return JSON.parse(stored) as { token?: string; cookie?: string };
				} catch {
					return null;
				}
			}
		}
	}

	try {
		const data = await readFile(CREDENTIALS_FILE, "utf8");
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

	if (process.env.SSH_CONNECTION || process.env.SSH_CLIENT || process.env.SSH_TTY) {
		return false;
	}

	return process.platform === "darwin" || process.platform === "win32" || Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
}

async function loadKeytar(): Promise<{
	setPassword: (
		service: string,
		account: string,
		password: string,
	) => Promise<void>;
	getPassword: (service: string, account: string) => Promise<string | null>;
} | null> {
	try {
		// Avoid static resolution/bundling of optional native dependency.
		const runtimeImport = new Function("s", "return import(s)") as (
			s: string,
		) => Promise<unknown>;
		const mod = await runtimeImport(KEYTAR_MODULE_SPECIFIER);
		if (mod && typeof mod === "object" && "default" in mod) {
			return (mod as { default: unknown }).default as {
				setPassword: (
					service: string,
					account: string,
					password: string,
				) => Promise<void>;
				getPassword: (
					service: string,
					account: string,
				) => Promise<string | null>;
			};
		}
		return mod as {
			setPassword: (
				service: string,
				account: string,
				password: string,
			) => Promise<void>;
			getPassword: (service: string, account: string) => Promise<string | null>;
		};
	} catch {
		return null;
	}
}
