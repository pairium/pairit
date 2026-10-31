/**
 * Simple expression evaluator for branching conditions like "session_state.age < 18"
 */

/** What a session may read about its matched group (built by the server). */
export type GroupView = {
	ws: Record<string, unknown>;
	others: Record<string, unknown>[];
};

export const EMPTY_GROUP: GroupView = { ws: {}, others: [] };

/** What expressions and templates can read. */
export type Scope = {
	session_state: Record<string, unknown>;
	group?: GroupView;
};

/** A readable path, like session_state.age or group.others.0.r1_estimate. */
export const SCOPE_PATH = String.raw`(?:session_state|group)\.[A-Za-z0-9_.]+`;

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

export function getScopePath(scope: Scope, path: string): unknown {
	return path.split(".").reduce<unknown>((current, key) => {
		if (current == null || typeof current !== "object") return undefined;
		return (current as Record<string, unknown>)[key];
	}, scope);
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

export function evaluateExpression(expr: string, scope: Scope): boolean {
	const match = expr.match(
		new RegExp(`^(${SCOPE_PATH})\\s*(==|!=|<=|>=|<|>)\\s*(.+)$`),
	);
	if (!match) return false;

	const [, path, op, rawValue] = match;
	const left = getScopePath(scope, path);
	const right = parseValue(rawValue.trim());

	return compare(left, op as ComparisonOp, right);
}
