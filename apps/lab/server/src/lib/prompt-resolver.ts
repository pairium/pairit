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

export function evaluateExpression(
	expr: string,
	context: { user_state: Record<string, unknown> },
): boolean {
	const match = expr.match(/^user_state\.(\w+)\s*(==|!=|<=|>=|<|>)\s*(.+)$/);
	if (!match) return false;

	const [, path, op, rawValue] = match;
	const left = context.user_state[path];
	const right = parseValue(rawValue.trim());

	return compare(left, op as ComparisonOp, right);
}

export function interpolate(
	text: string,
	userState: Record<string, unknown> | undefined,
): string {
	return text.replace(/\{\{user_state\.(\w+)\}\}/g, (_, key) => {
		const value = userState?.[key];
		return value !== undefined ? String(value) : `{{user_state.${key}}}`;
	});
}

export type ConditionalPrompt = { when?: string; system: string };

export function resolveSystemPrompt(
	system: string,
	prompts: ConditionalPrompt[] | undefined,
	userState: Record<string, unknown> | undefined,
): string {
	let resolved = system;

	if (prompts && prompts.length > 0) {
		const context = { user_state: userState ?? {} };
		let matched = false;

		for (const entry of prompts) {
			if (entry.when) {
				if (evaluateExpression(entry.when, context)) {
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

	return interpolate(resolved, userState);
}
