type ChatProps = {
	scope?: unknown;
};

type LintablePage = {
	id?: string;
	components?: unknown[];
};

type LintableConfig = {
	pages?: LintablePage[];
};

/**
 * Validate chat component `scope` ("participant" | "group") prop.
 */
export function lintChats(config: LintableConfig): string[] {
	const errors: string[] = [];

	config.pages?.forEach((page, pageIndex) => {
		const pageName = page.id ?? `pages[${pageIndex}]`;
		page.components?.forEach((component, componentIndex) => {
			const c = component as {
				type?: unknown;
				props?: ChatProps;
			} | null;
			if (c?.type !== "chat" || !c.props) return;

			const { scope } = c.props;
			if (scope !== undefined && scope !== "participant" && scope !== "group") {
				errors.push(
					`${pageName}.components[${componentIndex}]: chat scope must be "participant" or "group"`,
				);
			}
		});
	});

	return errors;
}
