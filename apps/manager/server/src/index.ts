/**
 * Manager Server Entry Point
 * Elysia app with config and media management
 */

import { cors } from "@elysiajs/cors";
import { Elysia, t } from "elysia";
import { findAllowed } from "./lib/allowlist";
import { initAllowlist } from "./lib/allowlist-boot";
import { getContactEmail } from "./lib/allowlist-hooks";
import { auth } from "./lib/auth";
import { CliAuthCodeStore } from "./lib/cli-auth-codes";
import { ensureConfigIndexes } from "./lib/db";
import { errorResponse } from "./lib/error-response";
import { escapeHtml, htmlResponse } from "./lib/html";
import { rejectPublicCredentialsKey } from "./lib/llm-credentials";
import { loginSuccessPage } from "./lib/login-success";
import { adminRoutes } from "./routes/admin";
import { configsRoutes } from "./routes/configs";
import { dataRoutes } from "./routes/data";
import { mediaRoutes } from "./routes/media";

const IS_DEV = process.env.NODE_ENV === "development";
rejectPublicCredentialsKey();
const RAW_CORS_ORIGINS = process.env.CORS_ORIGINS;
const ALLOWED_ORIGINS = RAW_CORS_ORIGINS
	? RAW_CORS_ORIGINS.split(",")
			.map((s) => s.trim())
			.filter(Boolean)
	: [];
const LAB_URL = process.env.PAIRIT_LAB_URL || "http://localhost:3001";
if (!IS_DEV && ALLOWED_ORIGINS.length === 0) {
	console.warn(
		"[CORS] CORS_ORIGINS not set; disabling cross-origin access in production",
	);
}

// One-time codes for the CLI login handoff (see lib/cli-auth-codes.ts)
const cliAuthCodes = new CliAuthCodeStore();

/** The caller's session, if it validates in the DB and is allowlisted. */
async function validatedSession(
	headers: Headers,
	sessionToken: string | undefined,
): Promise<{ token: string; userId: string } | null> {
	if (!sessionToken) return null;
	const data = await auth.api.getSession({
		headers,
		query: { disableCookieCache: true },
	});
	if (!data?.user) return null;
	if (!(await findAllowed(data.user.email))) return null;
	return { token: sessionToken, userId: data.user.id };
}

const app = new Elysia()
	.use(
		cors({
			origin: IS_DEV ? "*" : ALLOWED_ORIGINS,
			methods: ["GET", "POST", "DELETE", "OPTIONS"],
			allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
			exposeHeaders: ["Content-Type"],
			maxAge: 86400,
		}),
	)
	.onError(errorResponse)
	// Mount Better Auth handler at /api/auth/*
	.all("/api/auth/*", async ({ request, set }) => {
		try {
			console.log(`[Auth Request] ${request.method} ${request.url}`);
			const res = await auth.handler(request);
			console.log(`[Auth Response] Status: ${res.status}`);

			// If it's a 4xx or 5xx, or if we want to debug, log the body
			if (res.status >= 400) {
				try {
					const clone = res.clone();
					const text = await clone.text();
					console.log(`[Auth Response Body] ${text}`);
				} catch (e) {
					console.log(`[Auth Response Body] Could not read body: ${e}`);
				}
			}

			return res;
		} catch (error) {
			console.error("[Auth Fatal Error]:", error);
			set.status = 500;
			return {
				error: "Internal Server Error",
				message: "Internal server error",
			};
		}
	});

// Debug endpoints only available in non-production
if (IS_DEV) {
	app
		.get("/db-test", async () => {
			try {
				const { connectDB } = await import("./lib/db");
				const database = await connectDB();
				if (!database)
					throw new Error("Database connection failed to return a Db object");

				const collections = await database.listCollections().toArray();
				return {
					status: "ok",
					databaseName: database.databaseName,
					collections: collections.map((c: { name: string }) => c.name),
				};
			} catch (error) {
				console.error("[DB Test Error]:", error);
				return {
					status: "error",
					message: error instanceof Error ? error.message : String(error),
				};
			}
		})
		.get("/debug-env", () => {
			const uri = process.env.MONGODB_URI || "FAILOVER_TO_DEFAULT";
			const redactedUri =
				uri.length > 20
					? `${uri.substring(0, 15)}...${uri.substring(uri.length - 10)}`
					: uri;

			return {
				MONGODB_URI_REDACTED: redactedUri,
				ENV_KEYS: Object.keys(process.env).filter(
					(k) => !k.includes("SECRET") && !k.includes("PASSWORD"),
				),
				GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? "SET" : "MISSING",
				AUTH_BASE_URL: process.env.AUTH_BASE_URL || "MISSING",
			};
		});
}

app
	// Endpoint to exchange authorization code for session token (CLI use)
	.post(
		"/api/cli/exchange",
		async ({ body, set }) => {
			const result = cliAuthCodes.exchange(body.code, body.code_verifier);
			if (!result.ok) {
				set.status = 400;
				return {
					error: result.error,
					message:
						result.error === "invalid_verifier"
							? "Authorization code does not match this login"
							: "Invalid or expired authorization code",
				};
			}
			return { token: result.token };
		},
		{
			body: t.Object({
				code: t.String({ minLength: 1, maxLength: 256 }),
				code_verifier: t.Optional(t.String({ maxLength: 256 })),
			}),
		},
	)
	// Lets a CLI tell whether this server checks state and PKCE, so a newer
	// CLI still logs in to an older server.
	.get("/api/cli/login-info", () => ({
		state: true,
		codeChallengeMethods: ["S256"],
	}))
	.get("/login-success", async ({ query, cookie, request }) => {
		// Check for both standard and secure cookie names
		const sessionToken = (cookie["better-auth.session_token"]?.value ||
			cookie["__Secure-better-auth.session_token"]?.value) as
			| string
			| undefined;

		return loginSuccessPage({
			session: await validatedSession(request.headers, sessionToken),
			cliRedirectUri: query.cli_redirect_uri,
			manual: query.manual === "1",
			state: query.state,
			codeChallenge: query.code_challenge,
			codeChallengeMethod: query.code_challenge_method,
			mintCode: (input) => cliAuthCodes.mint(input),
		});
	})
	.get("/access-denied", () => {
		const contact = escapeHtml(getContactEmail());
		const content = `
            <h1>Access denied</h1>
            <p class="subtitle">Pairit Manager is invite-only. Your Google account isn't on the allowlist for this instance.</p>
            <div class="btn-row">
                <a href="mailto:${contact}" class="btn btn--primary">Request access</a>
                <a href="/" class="btn btn--ghost">Back to home</a>
            </div>
            <p class="footnote">Contact <a href="mailto:${contact}">${contact}</a></p>`;
		return htmlResponse({ title: "Access denied", content }, { status: 403 });
	})
	.get("/login", ({ query }) => {
		const manual = query.manual === "1";
		const content = `
            <h1>Sign in</h1>
            <p class="subtitle">${manual ? "Authenticate with your allowlisted Google account. We'll hand off a one-time code your CLI can exchange for a session." : "Authenticate with your allowlisted Google account. Your CLI will resume automatically when the handoff completes."}</p>
            <div class="btn-row">
                <button id="google-login" class="btn btn--primary">
                    Continue with Google
                </button>
            </div>
            <p class="footnote">Not on the allowlist? Ask your operator for an invite.</p>`;

		const scriptContent = `
            async function login() {
                try {
                    // Check if there is a CLI redirect URI in the current URL
                    const params = new URLSearchParams(window.location.search);
                    const cliRedirect = params.get('cli_redirect_uri');
                    
                    const origin = window.location.origin;
                    // Construct callback URL, passing through the CLI redirect if present
                    let callbackURL = origin + '/login-success';
                    const callbackParams = new URLSearchParams();
                    if (cliRedirect) {
                        callbackParams.set('cli_redirect_uri', cliRedirect);
                    }
                    // Pass the CLI's state and PKCE challenge through to /login-success
                    for (const key of ['state', 'code_challenge', 'code_challenge_method']) {
                        const value = params.get(key);
                        if (value) callbackParams.set(key, value);
                    }
                    if (${JSON.stringify(true)} && new URLSearchParams(window.location.search).get('manual') === '1') {
                        callbackParams.set('manual', '1');
                    }
                    const callbackQuery = callbackParams.toString();
                    if (callbackQuery) {
                        callbackURL += '?' + callbackQuery;
                    }

                    const res = await fetch(origin + '/api/auth/sign-in/social', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({
                            provider: 'google',
                            callbackURL: callbackURL
                        })
                    });
                    const data = await res.json();
                    if (data.url) {
                        window.location.href = data.url;
                    } else {
                        alert('Error: ' + JSON.stringify(data));
                    }
                } catch (err) {
                    alert('Error: ' + err.message);
                }
            }
            document.getElementById('google-login')?.addEventListener('click', login);`;

		return htmlResponse({
			title: "Sign in",
			content,
			scripts: scriptContent,
		});
	})
	.get("/", () => {
		const content = `
            <h1>Pairit Manager</h1>
            <p class="subtitle">The API server for the Pairit CLI. Sign in below, or head to the lab to run experiments.</p>
            <nav class="actions" aria-label="Primary destinations">
                <a href="/login" class="action">
                    <span class="label">Sign in to the CLI</span>
                    <span class="arrow" aria-hidden="true">→</span>
                </a>
                <a href="https://docs.pairium.ai/pairit/" class="action" target="_blank" rel="noopener">
                    <span class="label">Documentation</span>
                    <span class="arrow" aria-hidden="true">→</span>
                </a>
                <a href="${escapeHtml(LAB_URL)}" class="action">
                    <span class="label">Open the lab</span>
                    <span class="arrow" aria-hidden="true">→</span>
                </a>
            </nav>`;

		return htmlResponse({ title: "Pairit Manager", content });
	})
	.use(configsRoutes)
	.use(dataRoutes)
	.use(mediaRoutes)
	.use(adminRoutes)
	.listen({
		port: Number(process.env.PORT) || 3002,
		// Dev turns on wildcard CORS and debug routes; keep it off the LAN.
		hostname: IS_DEV ? "127.0.0.1" : "0.0.0.0",
	});

console.log(
	`🚀 Manager server running on ${app.server?.hostname}:${app.server?.port}`,
);

initAllowlist().catch((err) => {
	console.error("[Allowlist] Initialization failed:", err);
});

ensureConfigIndexes().catch((err) => {
	console.error("[Configs] Index creation failed:", err);
});
