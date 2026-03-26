/**
 * Simple expression evaluator for branching conditions like "session_state.age < 18"
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

function getNestedValue(
	obj: Record<string, unknown> | undefined,
	path: string,
): unknown {
	if (!obj) return undefined;
	return path.split(".").reduce<unknown>((current, key) => {
		if (current == null || typeof current !== "object") return undefined;
		return (current as Record<string, unknown>)[key];
	}, obj);
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

export function evaluateExpression(
	expr: string,
	context: { session_state: Record<string, unknown> },
): boolean {
	const match = expr.match(
		/^session_state\.([A-Za-z0-9_.]+)\s*(==|!=|<=|>=|<|>)\s*(.+)$/,
	);
	if (!match) return false;

	const [, path, op, rawValue] = match;
	const left = getNestedValue(context.session_state, path);
	const right = parseValue(rawValue.trim());

	return compare(left, op as ComparisonOp, right);
}
