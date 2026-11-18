// Spreadsheet apps run a cell that starts with one of these as a formula.
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/**
 * One CSV cell. Participant answers are untrusted: a leading formula character
 * gets a `'` so Excel or Sheets shows it as text, and any comma, quote, CR or
 * LF quotes the cell. Numbers and booleans pass through unchanged.
 */
export function escapeCsvValue(value: unknown): string {
	if (value === null || value === undefined) return "";
	let str = String(value);
	if (typeof value === "string" && FORMULA_PREFIX.test(str)) {
		str = `'${str}`;
	}
	if (/[",\r\n]/.test(str)) {
		return `"${str.replace(/"/g, '""')}"`;
	}
	return str;
}
