export function cn(...inputs: Array<unknown>): string {
	const classes: string[] = [];

	for (const input of inputs) {
		if (!input) continue;

		if (typeof input === "string") {
			classes.push(input);
			continue;
		}

		if (Array.isArray(input)) {
			const value = cn(...input);
			if (value) classes.push(value);
			continue;
		}

		if (typeof input === "object") {
			for (const [key, enabled] of Object.entries(
				input as Record<string, unknown>,
			)) {
				if (enabled) classes.push(key);
			}
		}
	}

	return classes.join(" ");
}
