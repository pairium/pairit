/**
 * The config sent to the participant's browser. Agent prompts, models and
 * tools stay on the server, and so does each page's endRedirectUrl (the
 * Prolific completion URL): the server returns the current page, with its
 * redirect, once the participant reaches it.
 */
export function toClientConfig<T>(config: T): T {
	if (!config || typeof config !== "object") return config;
	const source = config as Record<string, unknown>;
	const result: Record<string, unknown> = { ...source };

	if (Array.isArray(source.agents)) {
		result.agents = source.agents.map((agent) => {
			const a = (agent ?? {}) as Record<string, unknown>;
			return {
				id: a.id,
				...(a.avatar !== undefined && { avatar: a.avatar }),
			};
		});
	}

	const stripPage = (page: unknown) => {
		if (!page || typeof page !== "object") return page;
		const { endRedirectUrl: _omit, ...rest } = page as Record<string, unknown>;
		return rest;
	};
	if (Array.isArray(source.pages)) {
		result.pages = source.pages.map(stripPage);
	} else if (source.pages && typeof source.pages === "object") {
		result.pages = Object.fromEntries(
			Object.entries(source.pages).map(([id, page]) => [id, stripPage(page)]),
		);
	}
	if (Array.isArray(source.nodes)) {
		result.nodes = source.nodes.map(stripPage);
	}

	return result as T;
}
