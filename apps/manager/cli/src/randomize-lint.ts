type RandomizeSettings = {
	scope?: unknown;
	distribute?: unknown;
	conditions?: unknown;
};

type LintablePage = {
	id?: string;
	onEnter?: unknown[];
	components?: unknown[];
};

type LintableConfig = {
	pages?: LintablePage[];
	matchmaking?: unknown;
};

/**
 * Check `distribute: true` randomizations. The list must have one condition
 * per group member. Group size is only known here when every matchmaking
 * pool has the same size; otherwise the lab server checks it at runtime.
 */
export function lintRandomization(config: LintableConfig): string[] {
	const errors: string[] = [];
	const groupSize = singleGroupSize(config);

	const check = (where: string, settings: RandomizeSettings) => {
		if (settings.distribute !== true) return;
		if (settings.scope !== "group") {
			errors.push(`${where}: distribute: true needs scope: group`);
		}
		const conditions = settings.conditions;
		if (!Array.isArray(conditions) || conditions.length === 0) {
			errors.push(`${where}: distribute: true needs a conditions list`);
			return;
		}
		if (groupSize !== undefined && conditions.length !== groupSize) {
			errors.push(
				`${where}: distribute: true needs one condition per group member (${conditions.length} conditions, groups of ${groupSize})`,
			);
		}
	};

	config.pages?.forEach((page, pageIndex) => {
		const pageName = page.id ?? `pages[${pageIndex}]`;
		page.onEnter?.forEach((action, actionIndex) => {
			const a = action as ({ type?: unknown } & RandomizeSettings) | null;
			if (a?.type === "randomize") {
				check(`${pageName}.onEnter[${actionIndex}]`, a);
			}
		});
		page.components?.forEach((component, componentIndex) => {
			const c = component as {
				type?: unknown;
				props?: RandomizeSettings;
			} | null;
			if (c?.type === "randomization" && c.props) {
				check(`${pageName}.components[${componentIndex}]`, c.props);
			}
		});
	});

	return errors;
}

function singleGroupSize(config: LintableConfig): number | undefined {
	const sizes = new Set<number>();
	if (Array.isArray(config.matchmaking)) {
		for (const pool of config.matchmaking) {
			const size = (pool as { num_users?: unknown } | null)?.num_users;
			sizes.add(typeof size === "number" ? size : 2);
		}
	}
	for (const page of config.pages ?? []) {
		for (const component of page.components ?? []) {
			const c = component as {
				type?: unknown;
				props?: { poolId?: unknown; num_users?: unknown };
			} | null;
			// Components that name a pool take their size from it
			if (c?.type !== "matchmaking" || c.props?.poolId !== undefined) continue;
			const size = c.props?.num_users;
			sizes.add(typeof size === "number" ? size : 2);
		}
	}
	return sizes.size === 1 ? [...sizes][0] : undefined;
}
