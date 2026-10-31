/**
 * Resolves agent system prompts with template interpolation and conditional blocks
 */

type ComparisonOp = "==" | "!=" | "<=" | ">=" | "<" | ">";

function parseValue(raw: string): unknown {
	if (raw === "true") return true;
	if (raw === "false") return false;

	const num = Number(raw);
	if (!Number.isNaN(num)) return num;

	if (
		(raw.startsWith('"') && raw.endsWith('"')) ||
		(raw.startsWith("'") && raw.endsWith("'"))
	) {
		return raw.slice(1, -1);
	}

	return raw;
}

function compare(left: unknown, op: ComparisonOp, right: unknown): boolean {
	switch (op) {
		case "==":
			return left === right;
		case "!=":
			return left !== right;
		case "<":
			return typeof left === "number" && typeof right === "number"
				? left < right
				: false;
		case ">":
			return typeof left === "number" && typeof right === "number"
				? left > right
				: false;
		case "<=":
			return typeof left === "number" && typeof right === "number"
				? left <= right
				: false;
		case ">=":
			return typeof left === "number" && typeof right === "number"
				? left >= right
				: false;
		default:
			return false;
	}
}

// What prompts can read: session_state, and the group view as `group`
type Scope = {
	session_state?: Record<string, unknown>;
	group?: unknown;
};

const PATH = String.raw`(?:session_state|group)\.[A-Za-z0-9_.]+`;

function getPath(scope: Scope, path: string): unknown {
	return path.split(".").reduce<unknown>((current, key) => {
		if (current == null || typeof current !== "object") return undefined;
		return (current as Record<string, unknown>)[key];
	}, scope);
}

export function evaluateExpression(expr: string, scope: Scope): boolean {
	const match = expr.match(
		new RegExp(`^(${PATH})\\s*(==|!=|<=|>=|<|>)\\s*(.+)$`),
	);
	if (!match) return false;

	const [, path, op, rawValue] = match;
	const left = getPath(scope, path);
	const right = parseValue(rawValue.trim());

	return compare(left, op as ComparisonOp, right);
}

export function interpolate(text: string, scope: Scope): string {
	return text.replace(new RegExp(`\\{\\{(${PATH})\\}\\}`, "g"), (raw, path) => {
		const value = getPath(scope, path);
		return value !== undefined ? String(value) : raw;
	});
}

export type ConditionalPrompt = { when?: string; system: string };

export function resolveSystemPrompt(
	system: string,
	prompts: ConditionalPrompt[] | undefined,
	sessionState: Record<string, unknown> | undefined,
	group?: unknown,
): string {
	let resolved = system;
	const scope: Scope = { session_state: sessionState ?? {}, group };

	if (prompts && prompts.length > 0) {
		let matched = false;

		for (const entry of prompts) {
			if (entry.when) {
				if (evaluateExpression(entry.when, scope)) {
					resolved = entry.system;
					matched = true;
					break;
				}
			}
		}

		if (!matched) {
			const fallback = prompts.find((p) => !p.when);
			if (fallback) {
				resolved = fallback.system;
			}
		}
	}

	return interpolate(resolved, scope);
}
