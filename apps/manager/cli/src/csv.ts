// Spreadsheet apps run a cell that starts with one of these as a formula.
const FORMULA_PREFIX = /^[=+\-@\t\r]/;
// A plain signed number ("-5", "+3.2", "-1e3") is data, not a formula:
// marking it would break analysis of negative answers saved as text.
const PLAIN_NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

/**
 * One CSV cell. Participant answers are untrusted: a leading formula character
 * gets a `'` so Excel or Sheets shows it as text, and any comma, quote, CR or
 * LF quotes the cell. Numbers, booleans and text that is only a signed
 * number pass through unchanged.
 */
export function escapeCsvValue(value: unknown): string {
	if (value === null || value === undefined) return "";
	let str = String(value);
	if (
		typeof value === "string" &&
		FORMULA_PREFIX.test(str) &&
		!PLAIN_NUMBER.test(str)
	) {
		str = `'${str}`;
	}
	if (/[",\r\n]/.test(str)) {
		return `"${str.replace(/"/g, '""')}"`;
	}
	return str;
}
