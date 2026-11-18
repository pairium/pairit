import { isValidCodeChallenge, isValidState } from "./cli-auth-codes";
import { validateCliRedirect } from "./cli-redirect";
import { escapeHtml, htmlResponse, scriptJson } from "./html";

export interface LoginSuccessInput {
	/** The caller's session, only when it validated against the database. */
	session: { token: string; userId: string } | null;
	cliRedirectUri: unknown;
	manual: boolean;
	/** Echoed back to the CLI's loopback server, which checks it. */
	state?: unknown;
	/** PKCE challenge from the CLI (S256 only). Absent for older CLIs. */
	codeChallenge?: unknown;
	codeChallengeMethod?: unknown;
	/** Mints a one-time code. Returns null when no code can be issued. */
	mintCode: (input: {
		token: string;
		userId: string;
		codeChallenge: string | null;
	}) => string | null;
}

const CLOSE_BUTTON = `<button id="close-window" class="btn btn--ghost">Close window</button>`;

function present(value: unknown): boolean {
	return value !== undefined && value !== null && value !== "";
}

function failure(message: string): Response {
	const content = `
            <h1>Sign-in handoff failed</h1>
            <p class="subtitle">${escapeHtml(message)}</p>
            <div class="btn-row">
                ${CLOSE_BUTTON}
            </div>`;
	const scripts = `
            document.getElementById('close-window')?.addEventListener('click', () => window.close());`;
	return htmlResponse(
		{ title: "Sign-in failed", content, scripts },
		{ status: 400 },
	);
}

/**
 * The page Google sign-in lands on. It hands the CLI a one-time code, either by
 * redirecting to the CLI's loopback server or by showing it for manual paste.
 */
export function loginSuccessPage({
	session,
	cliRedirectUri,
	manual,
	state,
	codeChallenge,
	codeChallengeMethod,
	mintCode,
}: LoginSuccessInput): Response {
	const cliRedirect = validateCliRedirect(cliRedirectUri);

	let challenge: string | null = null;
	if (present(codeChallenge) || present(codeChallengeMethod)) {
		if (
			!isValidCodeChallenge(codeChallenge) ||
			codeChallengeMethod !== "S256"
		) {
			return failure(
				"The CLI sent an invalid login request. Run pairit login again.",
			);
		}
		challenge = codeChallenge;
	}
	if (present(state) && !isValidState(state)) {
		return failure(
			"The CLI sent an invalid login request. Run pairit login again.",
		);
	}

	let code: string | null = null;
	if (session && (cliRedirect || manual)) {
		code = mintCode({
			token: session.token,
			userId: session.userId,
			codeChallenge: challenge,
		});
		if (!code) {
			return failure(
				"The server is busy. Wait a minute, then run pairit login again.",
			);
		}
	}

	let redirectUrl: string | undefined;
	let manualCode: string | undefined;
	if (code && cliRedirect) {
		cliRedirect.searchParams.set("code", code);
		if (isValidState(state)) cliRedirect.searchParams.set("state", state);
		redirectUrl = cliRedirect.toString();
	} else if (code) {
		manualCode = code;
	}

	const content = redirectUrl
		? `
            <h1>Signed in</h1>
            <p class="subtitle">Returning you to the CLI…</p>
            <p class="footnote">Nothing happening? <a href="${escapeHtml(redirectUrl)}">Retry the handoff.</a></p>`
		: manualCode
			? `
            <h1>One-time code</h1>
            <p class="subtitle">Paste this into your terminal. It expires in 2 minutes.</p>
            <p class="token-meta">Authorization code</p>
            <div class="token" id="auth-code">${escapeHtml(manualCode)}</div>
            <div class="btn-row">
                <button id="copy-code" class="btn btn--primary">Copy code</button>
                ${CLOSE_BUTTON}
            </div>`
			: `
            <h1>Signed in</h1>
            <p class="subtitle">You're authenticated. You can close this window and return to your CLI.</p>
            <div class="btn-row">
                ${CLOSE_BUTTON}
            </div>`;

	const scripts = `
            const redirectUrl = ${scriptJson(redirectUrl ?? "")};

            document.getElementById('copy-code')?.addEventListener('click', async () => {
                const code = document.getElementById('auth-code')?.textContent || '';
                if (!code) return;
                try {
                    await navigator.clipboard.writeText(code);
                } catch (_error) {
                    // ignore clipboard failures
                }
            });
            document.getElementById('close-window')?.addEventListener('click', () => window.close());

            if (redirectUrl) {
                setTimeout(() => {
                    window.location.href = redirectUrl;
                }, 1000);
            }`;

	return htmlResponse({ title: "Signed in", content, scripts });
}
