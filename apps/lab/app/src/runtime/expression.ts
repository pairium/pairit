/**
 * Simple expression evaluator for branching conditions like "user_state.age < 18"
 */

type ComparisonOp = "==" | "!=" | "<=" | ">=" | "<" | ">";

function parseValue(raw: string): unknown {
	// Boolean
	if (raw === "true") return true;
	if (raw === "false") return false;

	// Number
	const num = Number(raw);
	if (!Number.isNaN(num)) return num;

	// String (quoted)
	if (
		(raw.startsWith('"') && raw.endsWith('"')) ||
		(raw.startsWith("'") && raw.endsWith("'"))
	) {
		return raw.slice(1, -1);
	}

	// Default to string
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

export function evaluateExpression(
	expr: string,
	context: { user_state: Record<string, unknown> },
): boolean {
	// Parse expressions like "user_state.age < 18"
	const match = expr.match(/^user_state\.(\w+)\s*(==|!=|<=|>=|<|>)\s*(.+)$/);
	if (!match) return false;

	const [, path, op, rawValue] = match;
	const left = context.user_state[path];
	const right = parseValue(rawValue.trim());

	return compare(left, op as ComparisonOp, right);
}
