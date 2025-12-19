import { createAuthClient } from "better-auth/client";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { renderCliSuccessPage } from "@pairit/html";

const CONFIG_DIR = join(homedir(), ".pairit");
const CREDENTIALS_FILE = join(CONFIG_DIR, "credentials.json");

const BASE_URL = process.env.PAIRIT_API_URL || "http://localhost:3002";

// Initialize auth client
export const authClient = createAuthClient({
    baseURL: BASE_URL,
});

export async function login() {
    console.log("Initiating login...");

    const loginUrl = `${BASE_URL}/login`;

    // Try automated loopback flow
    try {
        const { createServer } = await import("node:http");
        const { default: open } = await import("open");

        const server = createServer();
        const port = await new Promise<number>((resolve, reject) => {
            server.listen(0, "127.0.0.1", () => {
                const address = server.address();
                if (address && typeof address === 'object') {
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

        const token = await new Promise<string>((resolve, reject) => {
            // Set 2 minute timeout
            const timeout = setTimeout(() => {
                server.close();
                reject(new Error("Login timed out"));
            }, 120000);

            server.on("request", (req, res) => {
                try {
                    const url = new URL(req.url || "/", `http://${req.headers.host}`);
                    const token = url.searchParams.get("token");

                    if (token) {
                        res.writeHead(200, { "Content-Type": "text/html" });
                        res.end(renderCliSuccessPage());
                        clearTimeout(timeout);
                        server.close();
                        resolve(token);
                    } else {
                        res.writeHead(400);
                        res.end("Missing token");
                    }
                } catch (e) {
                    res.writeHead(500);
                    res.end("Error processing request");
                }
            });
        });

        await saveCredentials({ token });
        console.log("Successfully logged in!");
        return;

    } catch (error) {
        console.warn("Automated login failed, falling back to manual entry:", error instanceof Error ? error.message : String(error));
    }

    // Fallback Manual Flow
    console.log(`
Please visit: ${loginUrl}
                                                                   
`);

    try {
        const { default: open } = await import('open');
        await open(loginUrl);
    } catch (e) {
        // ignore open errors
    }

    const token = await prompt("Enter session token: ");
    if (!token) {
        console.error("No token provided");
        process.exit(1);
    }

    await saveCredentials({ token });
    console.log("Successfully logged in!");
}

export async function getAuthHeaders(): Promise<HeadersInit> {
    try {
        const creds = await getCredentials();
        if (creds?.cookie) {
            return { "Cookie": creds.cookie };
        }
        if (creds?.token) {
            const headers = {
                "Cookie": `better-auth.session_token=${creds.token}; __Secure-better-auth.session_token=${creds.token}`,
                "Authorization": `Bearer ${creds.token}`,
                "Origin": BASE_URL,
                "Referer": `${BASE_URL}/`
            };
            // console.log("DEBUG: Auth Headers", JSON.stringify(headers, null, 2));
            return headers;
        }
    } catch (e) {
        // ignore missing credentials
    }
    return {};
}

async function saveCredentials(creds: { token?: string; cookie?: string }) {
    await mkdir(CONFIG_DIR, { recursive: true });
    await writeFile(CREDENTIALS_FILE, JSON.stringify(creds, null, 2));
}

async function getCredentials(): Promise<{ token?: string; cookie?: string } | null> {
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
