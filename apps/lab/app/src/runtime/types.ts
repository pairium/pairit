import type {
	ComponentEventsConfig,
	ComponentInstance,
} from "@pairit/client/types";

export type ButtonAction = {
	type: "go_to";
	target?: string;
	branches?: Array<{
		when?: string;
		target: string;
	}>;
	skipValidation?: boolean;
	setState?: Record<string, unknown>;
};

export type {
	ComponentEventsConfig,
	ComponentInstance,
	OnEnterAction,
	Page,
} from "@pairit/client/types";

export type Button = {
	id: string;
	text: string;
	action: ButtonAction;
	events?: ComponentEventsConfig<"button">;
	highlightWhen?: string;
};

export type TextComponent = ComponentInstance<
	"text",
	{ text: string; markdown?: boolean }
>;

export type ButtonsComponent = ComponentInstance<
	"buttons",
	{ buttons: Button[] }
>;

export type MediaComponent = ComponentInstance<
	"media",
	{ type: string; src: string; alt?: string; label?: string; captions?: string }
>;

export type HtmlComponent = ComponentInstance<
	"html",
	{
		src?: string;
		html?: string;
		read?: string[];
		write?: string[];
		height?: number;
		required?: boolean;
		action?: ButtonAction;
	}
>;

export type AnyComponentInstance = ComponentInstance<
	string,
	Record<string, unknown>
>;
