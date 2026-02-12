import type {
	Button,
	ButtonsComponent,
	ComponentInstance,
	Page,
	TextComponent,
} from "./types";

type RawButton = Partial<Button> & { text?: unknown; action?: unknown; highlightWhen?: unknown };

type RawComponent =
	| string
	| unknown[]
	| (Record<string, unknown> & {
			type?: unknown;
			props?: unknown;
			buttons?: unknown;
			text?: unknown;
	  })
	| null
	| undefined;

type RawPage = Partial<Page> & {
	text?: unknown;
	buttons?: unknown;
	components?: unknown;
	componentType?: unknown;
	props?: unknown;
};

interface NormalizationOptions {
	pageId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeButton(
	raw: unknown,
	options: NormalizationOptions,
): Button | null {
	if (!raw || typeof raw !== "object") return null;
	const button = raw as RawButton;
	const text = typeof button.text === "string" ? button.text.trim() : null;
	const action = button.action;
	if (!text || !action || typeof action !== "object") return null;
	const goTo = action as {
		type?: unknown;
		target?: unknown;
		branches?: unknown;
	};
	if (goTo.type !== "go_to") return null;

	// Must have either target or branches
	const hasTarget = typeof goTo.target === "string";
	const hasBranches = Array.isArray(goTo.branches) && goTo.branches.length > 0;
	if (!hasTarget && !hasBranches) return null;

	const skipValidationCandidate =
		typeof (button as { skipValidation?: unknown }).skipValidation === "boolean"
			? (button as { skipValidation?: boolean }).skipValidation
			: typeof (button as { skip_validation?: unknown }).skip_validation ===
					"boolean"
				? (button as { skip_validation?: boolean }).skip_validation
				: typeof (goTo as { skipValidation?: unknown }).skipValidation ===
						"boolean"
					? (goTo as { skipValidation?: boolean }).skipValidation
					: typeof (goTo as { skip_validation?: unknown }).skip_validation ===
							"boolean"
						? (goTo as { skip_validation?: boolean }).skip_validation
						: undefined;
	const skipValidation = skipValidationCandidate === true;
	const id =
		typeof button.id === "string" && button.id.trim().length > 0
			? button.id.trim()
			: `${options.pageId}_${text}`;

	// Build action with target and/or branches
	const normalizedAction: Button["action"] = { type: "go_to" };
	if (hasTarget) normalizedAction.target = goTo.target as string;
	if (hasBranches)
		normalizedAction.branches = goTo.branches as Button["action"]["branches"];
	if (skipValidation) normalizedAction.skipValidation = true;

	const highlightWhen =
		typeof button.highlightWhen === "string" ? button.highlightWhen : undefined;

	return {
		id,
		text,
		action: normalizedAction,
		events: button.events,
		highlightWhen,
	};
}

function normalizeButtonsComponent(
	raw: RawComponent,
	options: NormalizationOptions,
): ButtonsComponent | null {
	if (raw == null) return null;

	const record = isRecord(raw) ? (raw as Record<string, unknown>) : null;
	const props =
		record && isRecord(record.props)
			? (record.props as Record<string, unknown>)
			: record;

	const buttonsInput = Array.isArray(props?.buttons)
		? (props?.buttons as unknown[])
		: Array.isArray(raw)
			? raw
			: null;

	if (!buttonsInput) return null;

	const buttons = buttonsInput
		.map((button) => normalizeButton(button, options))
		.filter((entry): entry is Button => Boolean(entry));

	if (!buttons.length) return null;

	return { type: "buttons", props: { buttons } };
}

function normalizeTextComponent(raw: RawComponent): TextComponent | null {
	if (raw == null) return null;

	const record = isRecord(raw) ? (raw as Record<string, unknown>) : null;
	const props =
		record && isRecord(record.props)
			? (record.props as Record<string, unknown>)
			: record;

	const textCandidate =
		typeof props?.text === "string"
			? props.text
			: typeof record?.text === "string"
				? record.text
				: null;
	if (!textCandidate) return null;

	const text = textCandidate.trim();
	if (!text.length) return null;

	const markdown =
		typeof props?.markdown === "boolean" ? props.markdown : undefined;

	return {
		type: "text",
		props: markdown === undefined ? { text } : { text, markdown },
	};
}

// survey component performs its own normalization; the runtime only passes through definitions

function normalizeComponent(
	raw: unknown,
	options: NormalizationOptions,
): ComponentInstance | null {
	if (raw == null) return null;

	if (typeof raw === "string") {
		const text = raw.trim();
		return text.length ? { type: "text", props: { text } } : null;
	}

	if (Array.isArray(raw)) {
		return normalizeButtonsComponent(raw, options);
	}

	if (!isRecord(raw)) return null;

	const record = raw as Record<string, unknown>;
	const type =
		typeof record.type === "string"
			? (record.type as string).trim()
			: undefined;

	if (type === "text" || (!type && typeof record.text === "string")) {
		return normalizeTextComponent(record);
	}

	const hasButtonsArray =
		type === "buttons" ||
		(!type && Array.isArray((record as { buttons?: unknown }).buttons));

	if (hasButtonsArray) {
		return normalizeButtonsComponent(record, options);
	}

	if (!type) return null;

	const props = isRecord(record.props)
		? { ...(record.props as Record<string, unknown>) }
		: {};
	const id = typeof record.id === "string" ? record.id : undefined;
	const events = isRecord(record.events)
		? (record.events as Record<
				string,
				{ type?: string; data?: Record<string, unknown> }
			>)
		: undefined;

	return {
		type,
		id,
		props,
		events,
	};
}

export function normalizePage(raw: RawPage): Page | null {
	if (!raw || typeof raw !== "object") return null;

	const id = typeof raw.id === "string" ? raw.id : null;
	if (!id) return null;

	const components: ComponentInstance[] = [];

	const pushNormalizedComponent = (entry: unknown) => {
		const component = normalizeComponent(entry, { pageId: id });
		if (component) components.push(component);
	};

	if (typeof raw.text === "string") {
		components.push({
			type: "text",
			id: `${id}_text`,
			props: { text: raw.text },
		});
	}

	const surveySource = (() => {
		if ((raw as { survey?: unknown }).survey !== undefined) {
			return {
				definition: (raw as { survey?: unknown }).survey,
				source: "survey" as const,
			};
		}
		if ((raw as { survey_items?: unknown }).survey_items !== undefined) {
			return {
				definition: (raw as { survey_items?: unknown }).survey_items,
				source: "survey_items" as const,
			};
		}
		if ((raw as { surveyItems?: unknown }).surveyItems !== undefined) {
			return {
				definition: (raw as { surveyItems?: unknown }).surveyItems,
				source: "survey_items" as const,
			};
		}
		return undefined;
	})();

	if (surveySource) {
		components.push({
			type: "survey",
			id: `${id}_survey`,
			props: {
				definition: surveySource.definition,
				source: surveySource.source,
			},
		});
	}

	if (Array.isArray(raw.buttons)) {
		const buttons = raw.buttons
			.map((button) => normalizeButton(button, { pageId: id }))
			.filter((entry): entry is Button => Boolean(entry));
		if (buttons.length) {
			components.push({
				type: "buttons",
				id: `${id}_buttons`,
				props: { buttons },
			});
		}
	}

	if (Array.isArray(raw.components)) {
		for (const entry of raw.components) {
			pushNormalizedComponent(entry);
		}
	}

	if (typeof raw.componentType === "string") {
		pushNormalizedComponent({ type: raw.componentType, props: raw.props });
	} else if (Array.isArray(raw.componentType)) {
		for (const entry of raw.componentType) {
			pushNormalizedComponent(entry);
		}
	}

	const endRedirectUrl =
		typeof raw.endRedirectUrl === "string" ? raw.endRedirectUrl : undefined;

	if (!components.length) {
		return {
			id,
			end: Boolean(raw.end),
			endRedirectUrl,
			components: [],
		};
	}

	return {
		id,
		end: Boolean(raw.end),
		endRedirectUrl,
		components,
	};
}

export function normalizeConfig(
	config: unknown,
): { initialPageId: string; pages: Record<string, Page> } | null {
	if (!config || typeof config !== "object") return null;
	const parsed = config as {
		initialPageId?: unknown;
		pages?: unknown;
		nodes?: unknown;
	};

	const initialPageId =
		typeof parsed.initialPageId === "string" ? parsed.initialPageId : null;
	if (!initialPageId) return null;

	const pagesInput = parsed.pages ?? parsed.nodes;

	if (
		!pagesInput ||
		(typeof pagesInput !== "object" && !Array.isArray(pagesInput))
	)
		return null;

	const pages: Record<string, Page> = {};

	const entries: Array<[string, unknown]> = Array.isArray(pagesInput)
		? (pagesInput as unknown[]).map((value) => [
				typeof value === "object" && value && "id" in value
					? String((value as { id: unknown }).id)
					: "",
				value,
			])
		: Object.entries(pagesInput as Record<string, unknown>);

	for (const [, value] of entries) {
		const page = normalizePage(value as RawPage);
		if (!page) continue;
		pages[page.id] = page;
	}

	if (!pages[initialPageId]) return null;

	return { initialPageId, pages };
}
