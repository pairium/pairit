import type { ReactNode } from "react";

import type { ButtonAction, ComponentInstance } from "./types";

export type NavigationGuard = (
	action: ButtonAction,
) => boolean | undefined | Promise<boolean | undefined>;

export interface RuntimeComponentContext {
	onAction: (action: ButtonAction) => void | Promise<void>;
	registerNavigationGuard: (guard: NavigationGuard) => () => void;
	sessionId?: string | null;
	userState?: Record<string, unknown>;
	onUserStateChange?: (updates: Record<string, unknown>) => void;
}

export type RuntimeComponentRenderer<
	Type extends string = string,
	Props extends Record<string, unknown> = Record<string, unknown>,
> = (input: {
	component: ComponentInstance<Type, Props>;
	context: RuntimeComponentContext;
}) => ReactNode;

type AnyRenderer = RuntimeComponentRenderer<string, Record<string, unknown>>;

const registry = new Map<string, AnyRenderer>();

let fallbackRenderer: AnyRenderer | null = null;

const defaultFallbackRenderer: AnyRenderer = ({ component }) => (
	<div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
		Missing renderer for <code>{component.type}</code> components.
	</div>
);

export function registerComponent<
	Type extends string,
	Props extends Record<string, unknown>,
>(type: Type, renderer: RuntimeComponentRenderer<Type, Props>) {
	registry.set(type, renderer as AnyRenderer);
}

export function unregisterComponent(type: string) {
	registry.delete(type);
}

export function setFallbackComponent(
	renderer: RuntimeComponentRenderer | null,
) {
	fallbackRenderer = renderer as AnyRenderer | null;
}

export function getComponentRenderer(type: string): AnyRenderer {
	if (registry.has(type)) {
		return registry.get(type) as AnyRenderer;
	}

	if (!fallbackRenderer) {
		console.warn(`No renderer registered for component type "${type}".`);
		return defaultFallbackRenderer;
	}

	return fallbackRenderer;
}
