type TimerProps = {
	duration?: unknown;
	scope?: unknown;
	key?: unknown;
};

type LintablePage = {
	id?: string;
	components?: unknown[];
};

type LintableConfig = {
	pages?: LintablePage[];
};

const VALID_TIMER_KEY = /^[A-Za-z0-9_-]+$/;

/**
 * Validate timer `scope` ("session" | "group") and optional `key` props,
 * including conflicting scope/duration across timers that share a `key`.
 */
export function lintTimers(config: LintableConfig): string[] {
	const errors: string[] = [];
	const keyedTimers = new Map<
		string,
		{ where: string; scope: string; duration?: number }
	>();

	config.pages?.forEach((page, pageIndex) => {
		const pageName = page.id ?? `pages[${pageIndex}]`;
		page.components?.forEach((component, componentIndex) => {
			const c = component as {
				type?: unknown;
				props?: TimerProps;
			} | null;
			if (c?.type !== "timer" || !c.props) return;

			const where = `${pageName}.components[${componentIndex}]`;
			const { scope, key, duration } = c.props;

			const scopeValid =
				scope === undefined || scope === "session" || scope === "group";
			if (!scopeValid) {
				errors.push(`${where}: timer scope must be "session" or "group"`);
			}

			if (key !== undefined) {
				if (typeof key !== "string" || !VALID_TIMER_KEY.test(key)) {
					errors.push(
						`${where}: timer key must be a non-empty string of letters, numbers, hyphens, or underscores`,
					);
					return;
				}
				if (!scopeValid) return;
				const resolvedScope = scope === "group" ? "group" : "session";
				const resolvedDuration =
					typeof duration === "number" && Number.isFinite(duration)
						? Math.floor(duration)
						: undefined;
				const prev = keyedTimers.get(key);
				if (prev) {
					if (prev.scope !== resolvedScope) {
						errors.push(
							`${where}: timer key "${key}" uses scope "${resolvedScope}", which conflicts with ${prev.where} ("${prev.scope}")`,
						);
					}
					if (
						prev.duration !== undefined &&
						resolvedDuration !== undefined &&
						prev.duration !== resolvedDuration
					) {
						errors.push(
							`${where}: timer key "${key}" has duration ${resolvedDuration}, which conflicts with ${prev.where} (${prev.duration})`,
						);
					}
				} else {
					keyedTimers.set(key, {
						where,
						scope: resolvedScope,
						duration: resolvedDuration,
					});
				}
			}
		});
	});

	return errors;
}
