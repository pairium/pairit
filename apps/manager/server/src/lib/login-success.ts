import { validateCliRedirect } from "./cli-redirect";
import { escapeHtml, htmlResponse, scriptJson } from "./html";

export interface LoginSuccessInput {
	/** The caller's Better Auth session token, if they have one. */
	sessionToken: string | undefined;
	cliRedirectUri: unknown;
	manual: boolean;
	/** Mints a one-time code for the token. Called only when a code is shown or sent. */
	mintCode: (sessionToken: string) => string;
}

const CLOSE_BUTTON = `<button id="close-window" class="btn btn--ghost">Close window</button>`;

/**
 * The page Google sign-in lands on. It hands the CLI a one-time code, either by
 * redirecting to the CLI's loopback server or by showing it for manual paste.
 */
export function loginSuccessPage({
	sessionToken,
	cliRedirectUri,
	manual,
	mintCode,
}: LoginSuccessInput): Response {
	const cliRedirect = validateCliRedirect(cliRedirectUri);

	let redirectUrl: string | undefined;
	let manualCode: string | undefined;
	if (sessionToken && cliRedirect) {
		cliRedirect.searchParams.set("code", mintCode(sessionToken));
		redirectUrl = cliRedirect.toString();
	} else if (sessionToken && manual) {
		manualCode = mintCode(sessionToken);
	}

	const content = redirectUrl
		? `
            <h1>Signed in</h1>
            <p class="subtitle">Returning you to the CLI…</p>
            <p class="footnote">Nothing happening? <a href="${escapeHtml(redirectUrl)}">Retry the handoff.</a></p>`
		: manualCode
			? `
            <h1>One-time code</h1>
            <p class="subtitle">Paste this into your terminal. It expires in 60 seconds.</p>
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
