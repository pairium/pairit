import { allowedTargets, getConfigPage } from "./config-lookup";

export type AdvanceCheck<P> =
	| { ok: true; page: P }
	| { ok: false; status: 400 | 409; error: string };

/**
 * Whether a session on `currentPageId` may go to `target`. Only pages the
 * current page links to are allowed, plus the current page itself (a retry
 * after a lost response).
 */
export function checkAdvance<P = Record<string, unknown>>(
	session: { config: unknown; currentPageId: string; endedAt?: unknown },
	target: string,
): AdvanceCheck<P> {
	if (session.endedAt) {
		return { ok: false, status: 409, error: "session_ended" };
	}
	const page = getConfigPage(session.config, target);
	if (!page) {
		return { ok: false, status: 400, error: "unknown_page" };
	}
	if (target !== session.currentPageId) {
		const current = getConfigPage(session.config, session.currentPageId);
		if (!allowedTargets(current).has(target)) {
			return { ok: false, status: 400, error: "invalid_transition" };
		}
	}
	return { ok: true, page: page as P };
}
