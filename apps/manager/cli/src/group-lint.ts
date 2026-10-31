type LintablePage = {
	id?: string;
	components?: unknown[];
	[key: string]: unknown;
};

type LintableConfig = {
	pages?: LintablePage[];
	agents?: unknown[];
	matchmaking?: unknown;
};

const GROUP_PATH = /^group(?:\.[A-Za-z0-9_]+)*/;
const TEMPLATE = /\{\{\s*(group\.[A-Za-z0-9_.]+)\s*\}\}/g;

/**
 * Check matchmaking `share` lists and every `group.` path in templates and
 * `when:` conditions. `group.ws.<field>` must be a field of a structured group
 * workspace, and `group.others.<n>.<key>` a key some pool shares.
 */
export function lintGroupView(config: LintableConfig): string[] {
	const errors: string[] = [];

	const shared = new Set<string>();
	if (Array.isArray(config.matchmaking)) {
		config.matchmaking.forEach((pool, index) => {
			const share = (pool as { share?: unknown } | null)?.share;
			if (share === undefined) return;
			if (
				!Array.isArray(share) ||
				!share.every((key) => typeof key === "string" && /^\w+$/.test(key))
			) {
				errors.push(
					`matchmaking[${index}].share must be a list of session_state keys`,
				);
				return;
			}
			for (const key of share) shared.add(key);
		});
	}

	const fields = new Map<string, string>();
	for (const page of config.pages ?? []) {
		for (const component of page.components ?? []) {
			const c = component as {
				type?: unknown;
				props?: { scope?: unknown; mode?: unknown; fields?: unknown };
			} | null;
			if (
				c?.type !== "live-workspace" ||
				c.props?.scope !== "group" ||
				c.props?.mode !== "structured" ||
				!Array.isArray(c.props.fields)
			)
				continue;
			for (const field of c.props.fields) {
				const id = (field as { id?: unknown } | null)?.id;
				if (typeof id !== "string") continue;
				const other = fields.get(id);
				if (other && other !== page.id) {
					errors.push(
						`group workspace field ${id} is on both ${other} and ${page.id}; group.ws needs unique field ids`,
					);
				}
				fields.set(id, page.id ?? "");
			}
		}
	}

	const checkPath = (where: string, path: string) => {
		const [, part, ...rest] = path.split(".");
		if (part === "ws") {
			const field = rest[0];
			if (field && !fields.has(field)) {
				errors.push(
					`${where}: ${path} is not a field of a structured group workspace`,
				);
			}
			return;
		}
		if (part === "others") {
			const [index, key] = rest;
			if (index !== undefined && !/^\d+$/.test(index)) {
				errors.push(
					`${where}: ${path} needs a member number, like group.others.0`,
				);
			} else if (key && !shared.has(key)) {
				errors.push(
					`${where}: ${path} reads ${key}, which no matchmaking pool lists in share`,
				);
			}
			return;
		}
		errors.push(`${where}: ${path} should start with group.ws or group.others`);
	};

	const walk = (where: string, value: unknown, key?: string) => {
		if (typeof value === "string") {
			if (key === "when") {
				const path = value.trim().match(GROUP_PATH)?.[0];
				if (path && path !== "group") checkPath(where, path);
			}
			for (const match of value.matchAll(TEMPLATE)) checkPath(where, match[1]);
			return;
		}
		if (Array.isArray(value)) {
			for (const item of value) walk(where, item);
			return;
		}
		if (value && typeof value === "object") {
			for (const [k, v] of Object.entries(value)) walk(where, v, k);
		}
	};

	config.pages?.forEach((page, index) => {
		walk(page.id ?? `pages[${index}]`, page);
	});
	config.agents?.forEach((agent, index) => {
		const id = (agent as { id?: unknown } | null)?.id;
		walk(typeof id === "string" ? `agent ${id}` : `agents[${index}]`, agent);
	});

	return errors;
}
