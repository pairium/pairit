/**
 * Checks exported data for problems that a test run should catch before a
 * real study: sessions that never finished, required answers that never
 * saved, and groups where only some members finished.
 */

export type AuditSession = {
	sessionId: string;
	currentPageId: string;
	status: string;
	session_state: Record<string, unknown>;
	prolific: { prolificPid: string } | null;
	configRevision: number | null;
	createdAt: string | null;
	updatedAt: string | null;
};

export type AuditGroup = {
	groupId: string;
	sessionId: string;
};

export type AuditSurveyResponse = {
	sessionId: string;
	pageId: string;
	componentId: string;
	data: Record<string, unknown>;
};

type AuditConfig = {
	pages?: Array<{
		id?: string;
		components?: unknown[];
	}>;
};

export type AuditInput = {
	sessions: AuditSession[];
	groups: AuditGroup[];
	surveyResponses: AuditSurveyResponse[];
	config?: AuditConfig;
	requireState?: string[];
};

export type AuditResult = {
	sessions: number;
	completed: number;
	errors: string[];
	warnings: string[];
};

export type SessionFilter = {
	pidPrefix?: string;
	since?: string;
};

export function filterSessions<T extends AuditSession>(
	sessions: T[],
	filter: SessionFilter,
): T[] {
	const since = filter.since ? Date.parse(filter.since) : null;
	return sessions.filter((session) => {
		if (filter.pidPrefix) {
			const pid = session.prolific?.prolificPid ?? "";
			if (!pid.startsWith(filter.pidPrefix)) return false;
		}
		if (since !== null) {
			const created = session.createdAt ? Date.parse(session.createdAt) : NaN;
			if (!(created >= since)) return false;
		}
		return true;
	});
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBlank(value: unknown): boolean {
	if (value === undefined || value === null) return true;
	if (typeof value === "string") return value.trim() === "";
	if (Array.isArray(value)) return value.length === 0;
	return false;
}

/**
 * Required survey item ids on each page, keyed by page id. Items are required
 * unless the item or its answer sets `required: false`, as in the lab.
 */
export function requiredSurveyItems(
	config: AuditConfig,
): Map<string, string[]> {
	const byPage = new Map<string, string[]>();
	for (const page of config.pages ?? []) {
		if (!page?.id) continue;
		const ids: string[] = [];
		for (const component of page.components ?? []) {
			if (!isRecord(component) || component.type !== "survey") continue;
			if (!isRecord(component.props)) continue;
			const items = component.props.items;
			if (!Array.isArray(items)) continue;
			for (const item of items) {
				if (!isRecord(item) || typeof item.id !== "string") continue;
				let required = item.required !== false;
				if (
					isRecord(item.answer) &&
					typeof item.answer.required === "boolean"
				) {
					required = item.answer.required;
				}
				if (required) ids.push(item.id);
			}
		}
		if (ids.length > 0) byPage.set(page.id, ids);
	}
	return byPage;
}

function label(session: AuditSession): string {
	const pid = session.prolific?.prolificPid;
	return pid ? `${session.sessionId} (${pid})` : session.sessionId;
}

export function auditData(input: AuditInput): AuditResult {
	const errors: string[] = [];
	const warnings: string[] = [];
	const byId = new Map(input.sessions.map((s) => [s.sessionId, s]));

	// Every session should reach an end page.
	for (const session of input.sessions) {
		if (session.status !== "completed") {
			errors.push(
				`${label(session)} did not finish: stopped on page "${session.currentPageId}" (last update ${session.updatedAt ?? "unknown"})`,
			);
		}
	}

	// Required survey answers should be in the saved response.
	if (input.config) {
		const required = requiredSurveyItems(input.config);
		// A page can hold more than one survey, so pool its responses.
		const answered = new Map<string, AuditSurveyResponse[]>();
		for (const response of input.surveyResponses) {
			if (!byId.has(response.sessionId)) continue;
			const key = `${response.sessionId}\u0000${response.pageId}`;
			const list = answered.get(key) ?? [];
			list.push(response);
			answered.set(key, list);
		}
		for (const responses of answered.values()) {
			const { sessionId, pageId } = responses[0];
			const session = byId.get(sessionId) as AuditSession;
			const missing = (required.get(pageId) ?? []).filter((id) =>
				responses.every((r) => isBlank(r.data?.[id])),
			);
			if (missing.length > 0) {
				errors.push(
					`${label(session)} page "${pageId}": required answers not saved: ${missing.join(", ")}`,
				);
			}
		}
	}

	// Variables the analysis needs should be in session_state.
	for (const key of input.requireState ?? []) {
		const lacking = input.sessions.filter(
			(s) => s.status === "completed" && isBlank(getPath(s.session_state, key)),
		);
		for (const session of lacking) {
			errors.push(`${label(session)} has no session_state.${key}`);
		}
	}

	// In a group, either everyone finishes or someone got stuck waiting.
	const members = new Map<string, AuditSession[]>();
	for (const group of input.groups) {
		const session = byId.get(group.sessionId);
		if (!session) continue;
		const list = members.get(group.groupId) ?? [];
		list.push(session);
		members.set(group.groupId, list);
	}
	for (const [groupId, list] of members) {
		const done = list.filter((s) => s.status === "completed").length;
		if (done > 0 && done < list.length) {
			warnings.push(
				`group ${groupId}: ${done} of ${list.length} members finished`,
			);
		}
	}

	// A test run should use one config revision.
	const revisions = new Set(input.sessions.map((s) => s.configRevision));
	if (revisions.size > 1) {
		warnings.push(
			`sessions span config revisions ${[...revisions].join(", ")}; narrow with --since`,
		);
	}

	return {
		sessions: input.sessions.length,
		completed: input.sessions.filter((s) => s.status === "completed").length,
		errors,
		warnings,
	};
}

function getPath(state: Record<string, unknown>, key: string): unknown {
	let current: unknown = state;
	for (const part of key.split(".")) {
		if (!isRecord(current)) return undefined;
		current = current[part];
	}
	return current;
}
