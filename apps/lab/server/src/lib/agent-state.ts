/**
 * Which session_state paths an agent's assign_state tool may write
 *
 * A participant can steer an agent with what they type, so the agent's writes
 * are limited to keys the researcher meant it to have:
 * - never a server-owned key (PROTECTED_STATE_KEYS, randomization stateKeys);
 * - if the tool's `path` parameter has an `enum`, only those paths;
 * - else, if the config declares a `session_state` schema, only its
 *   top-level keys;
 * - else any other key.
 */

import { listRandomizations } from "./config-lookup";
import { filterProtectedUpdates, PROTECTED_STATE_KEYS } from "./session-state";

type DeclaredTool = { parameters?: Record<string, unknown> };

function isObj(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The `enum` on the tool's `path` parameter, if it declares one. */
function declaredPaths(tool: DeclaredTool | undefined): string[] | null {
	const properties = tool?.parameters?.properties;
	if (!isObj(properties)) return null;
	const path = properties.path;
	if (!isObj(path) || !Array.isArray(path.enum)) return null;
	return path.enum.filter((p): p is string => typeof p === "string");
}

/** Top-level keys of the config's `session_state` schema, if it has one. */
function schemaKeys(config: unknown): string[] | null {
	if (!isObj(config) || !isObj(config.session_state)) return null;
	return Object.keys(config.session_state);
}

/** Why the agent may not write `path`, or null if it may. */
export function assignStateRefusal(
	path: string,
	config: unknown,
	tool?: DeclaredTool,
): string | null {
	const serverOwned = [
		...PROTECTED_STATE_KEYS,
		...listRandomizations(config).map((r) => r.stateKey),
	];
	if (filterProtectedUpdates({ [path]: true }, serverOwned).ignored.length) {
		return `"${path}" is set by Pairit and cannot be assigned.`;
	}

	const allowed = declaredPaths(tool);
	if (allowed) {
		return allowed.includes(path)
			? null
			: `"${path}" is not one of the paths this tool may set: ${allowed.join(", ")}.`;
	}

	const keys = schemaKeys(config);
	if (keys) {
		const [top] = path.split(".");
		return keys.includes(top)
			? null
			: `"${path}" is not declared in session_state.`;
	}

	return null;
}
