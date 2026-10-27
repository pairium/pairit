/**
 * What a workspace file must stay. A .json file must parse, and match the
 * researcher's JSON Schema if one is set. Other files take any text.
 */

import Ajv, { type ValidateFunction } from "ajv";

const ajv = new Ajv({ allErrors: false });
const compiled = new WeakMap<object, ValidateFunction>();

/** Why `text` is not a valid `file`, or null if it is. */
export function checkWorkspaceText(
	file: string,
	text: string,
	schema?: object,
): string | null {
	if (!file.toLowerCase().endsWith(".json")) return null;
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch (error) {
		return `${file} would not be valid JSON (${(error as Error).message}).`;
	}
	if (!schema) return null;
	let validate = compiled.get(schema);
	if (!validate) {
		validate = ajv.compile(schema);
		compiled.set(schema, validate);
	}
	if (validate(value)) return null;
	const [first] = validate.errors ?? [];
	const where = first?.instancePath || "the top level";
	return `${file} would not match its schema: ${where} ${first?.message ?? "is invalid"}.`;
}
