import { createAuthClient } from "better-auth/client";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".pairit");
const CREDENTIALS_FILE = join(CONFIG_DIR, "credentials.json");

// Initialize auth client
export const authClient = createAuthClient({
    baseURL: process.env.PAIRIT_API_URL || "http://localhost:3002",
});

export async function login() {
    console.log("Initiating login...");

    // NOTE: If better-auth generic client doesn't support device flow directly yet,
    // we might need a workaround. For now, we'll try to use a manual copy-paste flow
    // or a placeholder if the specific device flow API isn't available in this version.

    // graceful fallback for demonstration if detailed SDK docs aren't handy:
    // We will ask user to grab their session cookie/token from browser for now
    // or use a simple credential prompt if we enabled email/pass (which we disabled).

    // Since Phase 3 enabled Google OAuth, we need a browser flow.
    // Real implementation for CLI + OAuth usually requires opening a browser
    // and having a local callback server.

    console.log(`
Please visit: ${authClient.options.baseURL}/api/auth/signin/google
Login, and then copy your 'better-auth.session_token' cookie value.
`);

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
        if (creds?.token) {
            return {
                "Cookie": `better-auth.session_token=${creds.token}`
            };
        }
    } catch (e) {
        // ignore missing credentials
    }
    return {};
}

async function saveCredentials(creds: { token: string }) {
    await mkdir(CONFIG_DIR, { recursive: true });
    await writeFile(CREDENTIALS_FILE, JSON.stringify(creds, null, 2));
}

async function getCredentials(): Promise<{ token: string } | null> {
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
