/**
 * Read randomization, matchmaking and navigation settings from the config a
 * session started on. The server uses these instead of trusting the values
 * a client sends.
 */

import { getOwnPath } from "./session-state";

export type AssignmentType = "random" | "balanced_random" | "block";

export type RandomizationSettings = {
	stateKey: string;
	assignmentType: AssignmentType;
	conditions: string[];
	scope: "session" | "group";
	distribute: boolean;
};

export type MatchmakingSettings = {
	poolId: string;
	numUsers: number;
	timeoutSeconds: number;
	timeoutTarget?: string;
	assignmentType?: AssignmentType;
	conditions?: string[];
};

export type TimerScope = "session" | "group";

export type TimerSettings = {
	componentId: string;
	duration: number;
	scope: TimerScope;
	key?: string;
};

export const DEFAULT_STATE_KEY = "treatment";
export const DEFAULT_POOL_ID = "default";
// Same defaults as the lab app's matchmaking component
const DEFAULT_NUM_USERS = 2;
const DEFAULT_TIMEOUT_SECONDS = 120;
export const MIN_TIMEOUT_SECONDS = 1;
export const MAX_TIMEOUT_SECONDS = 3600;
export const MAX_TIMER_DURATION_SECONDS = 86_400;

type Obj = Record<string, unknown>;

function isObj(value: unknown): value is Obj {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Pages of a compiled config, from `pages` or legacy `nodes`. */
export function configPages(config: unknown): Obj[] {
	if (!isObj(config)) return [];
	const input = config.pages ?? config.nodes;
	const list = Array.isArray(input)
		? input
		: isObj(input)
			? Object.values(input)
			: [];
	return list.filter(isObj);
}

export function getConfigPage(config: unknown, pageId: string): Obj | null {
	if (!isObj(config)) return null;
	const { pages, nodes } = config;
	if (isObj(pages)) {
		const page = pages[pageId];
		return isObj(page) ? page : null;
	}
	if (Array.isArray(nodes)) {
		return nodes.find((n): n is Obj => isObj(n) && n.id === pageId) ?? null;
	}
	return null;
}

/** Calls visit on every object under value, depth first. */
function walk(value: unknown, visit: (obj: Obj) => void): void {
	if (Array.isArray(value)) {
		for (const item of value) walk(item, visit);
		return;
	}
	if (!isObj(value)) return;
	visit(value);
	for (const child of Object.values(value)) walk(child, visit);
}

function asAssignmentType(value: unknown): AssignmentType | undefined {
	return value === "random" || value === "balanced_random" || value === "block"
		? value
		: undefined;
}

function asStrings(value: unknown): string[] | undefined {
	return Array.isArray(value)
		? value.filter((v): v is string => typeof v === "string")
		: undefined;
}

/** Settings of every randomize action and randomization component. */
export function listRandomizations(config: unknown): RandomizationSettings[] {
	const found: RandomizationSettings[] = [];
	walk(configPages(config), (obj) => {
		let settings: Obj | null = null;
		if (obj.type === "randomize") settings = obj;
		else if (obj.type === "randomization")
			settings = isObj(obj.props) ? obj.props : {};
		if (!settings) return;
		found.push({
			stateKey:
				typeof settings.stateKey === "string" && settings.stateKey
					? settings.stateKey
					: DEFAULT_STATE_KEY,
			assignmentType: asAssignmentType(settings.assignmentType) ?? "random",
			conditions: asStrings(settings.conditions) ?? [],
			scope: settings.scope === "group" ? "group" : "session",
			distribute: settings.distribute === true,
		});
	});
	return found;
}

export function findRandomization(
	config: unknown,
	stateKey: string = DEFAULT_STATE_KEY,
): RandomizationSettings | null {
	return (
		listRandomizations(config).find((r) => r.stateKey === stateKey) ?? null
	);
}

export function clampTimeoutSeconds(value: number): number {
	if (!Number.isFinite(value)) return DEFAULT_TIMEOUT_SECONDS;
	return Math.min(MAX_TIMEOUT_SECONDS, Math.max(MIN_TIMEOUT_SECONDS, value));
}

function toMatchmaking(poolId: string, settings: Obj): MatchmakingSettings {
	const numUsers =
		typeof settings.num_users === "number" &&
		Number.isInteger(settings.num_users) &&
		settings.num_users >= 2
			? settings.num_users
			: DEFAULT_NUM_USERS;
	const timeoutSeconds =
		typeof settings.timeoutSeconds === "number"
			? settings.timeoutSeconds
			: DEFAULT_TIMEOUT_SECONDS;
	return {
		poolId,
		numUsers,
		timeoutSeconds: clampTimeoutSeconds(timeoutSeconds),
		timeoutTarget:
			typeof settings.timeoutTarget === "string"
				? settings.timeoutTarget
				: undefined,
		assignmentType: asAssignmentType(settings.assignmentType),
		conditions: asStrings(settings.conditions),
	};
}

/**
 * The matchmaking component for a pool. The compiler copies a top-level
 * `matchmaking` pool's settings into its component; the top-level list is
 * the fallback.
 */
export function findMatchmaking(
	config: unknown,
	poolId: string = DEFAULT_POOL_ID,
): MatchmakingSettings | null {
	let found: MatchmakingSettings | null = null;
	walk(configPages(config), (obj) => {
		if (found || obj.type !== "matchmaking") return;
		const props = isObj(obj.props) ? obj.props : {};
		const id =
			typeof props.poolId === "string" ? props.poolId : DEFAULT_POOL_ID;
		if (id === poolId) found = toMatchmaking(poolId, props);
	});
	if (found) return found;

	const pools = isObj(config) ? config.matchmaking : undefined;
	if (Array.isArray(pools)) {
		const pool = pools.find((p): p is Obj => isObj(p) && p.id === poolId);
		if (pool) {
			// Top-level pools nest assignment settings
			const assignment = isObj(pool.assignment) ? pool.assignment : {};
			return toMatchmaking(poolId, {
				...pool,
				assignmentType: assignment.type,
				conditions: assignment.conditions,
			});
		}
	}
	return null;
}

/**
 * Find a timer component on `pageId` from the session's compiled config.
 * The server reads `duration`, `scope`, and `key` here instead of trusting the client.
 */
export function findTimer(
	config: unknown,
	pageId: string,
	componentId?: string,
): TimerSettings | null {
	const page = getConfigPage(config, pageId);
	if (!page || !Array.isArray(page.components)) return null;

	const timers: Array<{ id: string; props: Obj }> = [];
	page.components.forEach((raw, index) => {
		if (!isObj(raw) || raw.type !== "timer") return;
		const id =
			typeof raw.id === "string" && raw.id.length > 0
				? raw.id
				: `timer-${index}`;
		timers.push({ id, props: isObj(raw.props) ? raw.props : {} });
	});
	if (timers.length === 0) return null;

	const matched = componentId
		? (timers.find((t) => t.id === componentId) ??
			(componentId === "unknown" && timers.length === 1 ? timers[0] : null))
		: timers[0];
	if (!matched) return null;

	const rawDuration = matched.props.duration;
	if (
		typeof rawDuration !== "number" ||
		!Number.isFinite(rawDuration) ||
		rawDuration < 0
	) {
		return null;
	}

	const duration = Math.min(
		MAX_TIMER_DURATION_SECONDS,
		Math.max(0, Math.floor(rawDuration)),
	);
	const scope: TimerScope =
		matched.props.scope === "group" ? "group" : "session";
	const rawKey = matched.props.key;
	const key =
		typeof rawKey === "string" && rawKey.trim().length > 0
			? rawKey.trim()
			: undefined;

	return {
		componentId: matched.id,
		duration,
		scope,
		...(key && { key }),
	};
}

const TARGET_KEYS = ["target", "onMatchTarget", "timeoutTarget"];

/** Every page a participant can go to from this page. */
export function allowedTargets(page: unknown): Set<string> {
	const targets = new Set<string>();
	walk(page, (obj) => {
		for (const key of TARGET_KEYS) {
			const value = obj[key];
			if (typeof value === "string" && value) targets.add(value);
		}
	});
	return targets;
}

const GROUP_COMPONENTS = new Set(["chat", "live-workspace", "workspace"]);

/** Suffixes of `${sessionId}:<suffix>` groups the lab app builds. */
export function sessionGroupSuffixes(config: unknown): Set<string> {
	const suffixes = new Set<string>();
	for (const page of configPages(config)) {
		if (typeof page.id === "string") suffixes.add(page.id);
	}
	walk(configPages(config), (obj) => {
		if (!GROUP_COMPONENTS.has(obj.type as string) || !isObj(obj.props)) return;
		const groupId = obj.props.groupId;
		if (typeof groupId === "string" && groupId) suffixes.add(groupId);
	});
	return suffixes;
}

/** Reads a dotted path such as "a.b" from an object. */
export function getPath(obj: unknown, path: string): unknown {
	return getOwnPath(obj, path);
}
