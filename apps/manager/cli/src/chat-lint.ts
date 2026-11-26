type ChatProps = {
	scope?: unknown;
	groupId?: unknown;
};

type LintablePage = {
	id?: string;
	components?: unknown[];
};

type LintableConfig = {
	pages?: LintablePage[];
};

/**
 * Validate chat component `scope` ("participant" | "group") prop and catch
 * unconditional chat components on the same page that resolve to the same room.
 */
export function lintChats(config: LintableConfig): string[] {
	const errors: string[] = [];

	config.pages?.forEach((page, pageIndex) => {
		const pageName = page.id ?? `pages[${pageIndex}]`;
		const seenRooms = new Map<string, string>();

		page.components?.forEach((component, componentIndex) => {
			const c = component as {
				type?: unknown;
				props?: ChatProps;
				when?: unknown;
			} | null;
			if (c?.type !== "chat") return;

			const where = `${pageName}.components[${componentIndex}]`;
			const scope = c.props?.scope;
			const scopeValid =
				scope === undefined || scope === "participant" || scope === "group";
			if (!scopeValid) {
				errors.push(`${where}: chat scope must be "participant" or "group"`);
				return;
			}

			// Conditionally rendered chats (`when`) may be mutually exclusive.
			if (c.when !== undefined) return;

			const resolvedScope = scope === "participant" ? "participant" : "group";
			const explicitGroupId =
				typeof c.props?.groupId === "string" && c.props.groupId
					? c.props.groupId
					: pageName;
			const roomKey = `${resolvedScope}:${explicitGroupId}`;
			const prev = seenRooms.get(roomKey);
			if (prev) {
				errors.push(
					`${where}: duplicate chat room on page "${pageName}" (same as ${prev}); set distinct groupId props (and scope: "participant" for private chats)`,
				);
			} else {
				seenRooms.set(roomKey, where);
			}
		});
	});

	return errors;
}
