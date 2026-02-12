export type ButtonAction = {
	type: "go_to";
	target: string;
	skipValidation?: boolean;
};

export type ComponentEventDefinition = {
	type?: string;
	data?: Record<string, unknown>;
};

type ComponentEventMap = {
	button: "onClick";
	buttons: "onClick";
	survey: "onSubmit";
	media: "onPlay" | "onPause" | "onSeek" | "onComplete" | "onError";
	matchmaking: "onRequestStart" | "onMatchFound" | "onTimeout" | "onCancel";
	chat: "onMessageSend" | "onMessageReceive" | "onTypingStart" | "onTypingStop";
	form: "onSubmit" | "onFieldChange";
};

type ComponentEventName<TType extends keyof ComponentEventMap> =
	ComponentEventMap[TType];

export type ComponentEventsConfig<TType extends string = string> =
	TType extends keyof ComponentEventMap
		? Partial<Record<ComponentEventName<TType>, ComponentEventDefinition>>
		: Partial<Record<string, ComponentEventDefinition>>;

export type Button = {
	id: string;
	text: string;
	action: ButtonAction;
	events?: ComponentEventsConfig<"button">;
};

export interface ComponentInstance<
	Type extends string = string,
	Props extends Record<string, unknown> = Record<string, unknown>,
> {
	type: Type;
	id?: string;
	props: Props;
	events?: ComponentEventsConfig<Type>;
}

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

export type AnyComponentInstance = ComponentInstance<
	string,
	Record<string, unknown>
>;

export type Page = {
	id: string;
	end?: boolean;
	endRedirectUrl?: string;
	components?: ComponentInstance[];
};

export type EventMetadata = {
	sessionId: string;
	configId: string;
	pageId: string;
};

export type EventPayload<
	TType extends string = string,
	TData extends Record<string, unknown> = Record<string, unknown>,
> = {
	type: TType;
	timestamp: string;
	componentType: string;
	componentId: string;
	data: TData;
};
