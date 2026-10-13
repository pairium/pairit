import { Card, CardContent } from "@components/ui/Card";

import { useCallback, useMemo, useRef } from "react";
import { evaluateExpression } from "./expression";
import {
	getComponentRenderer,
	type NavigationGuard,
	type RuntimeComponentContext,
} from "./registry";
import type { ButtonAction, ComponentInstance, Page } from "./types";

function mergeNestedUpdates(
	base: Record<string, unknown>,
	updates: Record<string, unknown>,
): Record<string, unknown> {
	const next = structuredClone(base);
	for (const [path, value] of Object.entries(updates)) {
		const keys = path.split(".");
		if (keys.length === 1) {
			next[path] = value;
			continue;
		}
		let obj: Record<string, unknown> = next;
		for (let i = 0; i < keys.length - 1; i++) {
			const key = keys[i];
			if (obj[key] == null || typeof obj[key] !== "object") {
				obj[key] = {};
			}
			obj = obj[key] as Record<string, unknown>;
		}
		obj[keys[keys.length - 1]] = value;
	}
	return next;
}

// A chat in a split column fills the column: it drops its fixed height
// and its own border, and cancels the column padding to sit flush with
// the card edges. An html embed also drops its border and sits flush.
const SPLIT_COLUMN_CLASS = [
	"flex h-full flex-col gap-4 p-4",
	"[&>[data-chat]]:h-auto [&>[data-chat]]:min-h-0 [&>[data-chat]]:flex-1",
	"[&>[data-chat]]:-mx-4 [&>[data-chat]]:rounded-none [&>[data-chat]]:border-0",
	"[&>[data-chat]:first-child]:-mt-4 [&>[data-chat]:last-child]:-mb-4",
	"[&>[data-html]]:-mx-4 [&>[data-html]:first-child]:-mt-4",
	"[&>[data-html]_iframe]:rounded-none [&>[data-html]_iframe]:border-0",
].join(" ");

function isComponentVisible(
	component: ComponentInstance,
	sessionState: Record<string, unknown>,
): boolean {
	if (!component.when) return true;
	return evaluateExpression(component.when, { session_state: sessionState });
}

function resolveTarget(
	action: ButtonAction,
	sessionState: Record<string, unknown>,
): string {
	if (action.target) return action.target;
	if (!action.branches) throw new Error("No target or branches");

	for (const branch of action.branches) {
		if (!branch.when) return branch.target; // default branch
		if (evaluateExpression(branch.when, { session_state: sessionState })) {
			return branch.target;
		}
	}
	throw new Error("No matching branch");
}

interface PageRendererProps {
	page: Page;
	onAction: (action: ButtonAction) => Promise<void> | void;
	sessionId?: string | null;
	sessionState?: Record<string, unknown>;
	onSessionStateChange?: (updates: Record<string, unknown>) => void;
	compiledConfig?: import("./config").CompiledConfig | null;
	isNavigating?: boolean;
}

export function PageRenderer({
	page,
	onAction,
	sessionId,
	sessionState,
	onSessionStateChange,
	compiledConfig,
	isNavigating,
}: PageRendererProps) {
	const guardsRef = useRef<Set<NavigationGuard>>(new Set());
	const sessionStateRef = useRef<Record<string, unknown>>(sessionState ?? {});

	// Keep ref in sync with prop
	sessionStateRef.current = sessionState ?? {};

	const registerNavigationGuard = useCallback((guard: NavigationGuard) => {
		guardsRef.current.add(guard);
		return () => {
			guardsRef.current.delete(guard);
		};
	}, []);

	// Wrap onSessionStateChange to also update ref immediately (before React re-renders)
	const wrappedOnSessionStateChange = useCallback(
		(updates: Record<string, unknown>) => {
			sessionStateRef.current = mergeNestedUpdates(
				sessionStateRef.current,
				updates,
			);
			onSessionStateChange?.(updates);
		},
		[onSessionStateChange],
	);

	const guardedAction = useCallback(
		async (action: ButtonAction) => {
			if (action.skipValidation) {
				// Resolve target using current sessionState
				const target = resolveTarget(action, sessionStateRef.current);
				await onAction({ ...action, target });
				return;
			}
			const guards = Array.from(guardsRef.current);
			if (guards.length) {
				for (const guard of guards) {
					try {
						const result = await guard(action);
						if (result === false) {
							return;
						}
					} catch (error) {
						console.error("Navigation blocked by guard", error);
						return;
					}
				}
			}
			// Resolve target AFTER guards have run (they may have updated sessionState)
			const target = resolveTarget(action, sessionStateRef.current);
			await onAction({ ...action, target });
		},
		[onAction],
	);

	const runtimeContext: RuntimeComponentContext = useMemo(
		() => ({
			onAction: guardedAction,
			registerNavigationGuard,
			sessionId,
			sessionState,
			onSessionStateChange: wrappedOnSessionStateChange,
			pageId: page.id,
			compiledConfig,
			isNavigating,
		}),
		[
			guardedAction,
			registerNavigationGuard,
			sessionId,
			sessionState,
			wrappedOnSessionStateChange,
			page.id,
			compiledConfig,
			isNavigating,
		],
	);

	if (page.layout === "split") {
		const visibleComponents =
			page.components?.filter((c) =>
				isComponentVisible(c, sessionState ?? {}),
			) ?? [];
		// An explicit `column` wins. Otherwise the workspace goes right,
		// buttons go below both columns, and everything else goes left.
		const placementOf = (c: ComponentInstance) =>
			c.column ??
			(c.type === "live-workspace"
				? "right"
				: c.type === "buttons"
					? "bottom"
					: "left");
		const leftComponents = visibleComponents.filter(
			(c) => placementOf(c) === "left",
		);
		const rightComponents = visibleComponents.filter(
			(c) => placementOf(c) === "right",
		);
		const bottomComponents = visibleComponents.filter(
			(c) => placementOf(c) === "bottom",
		);

		return (
			<div key={page.id} className="page-enter flex justify-center">
				<div className="w-full max-w-6xl space-y-4">
					<div className="grid h-[calc(100vh-14rem)] grid-cols-2 gap-4">
						<Card className="overflow-hidden">
							<div className={SPLIT_COLUMN_CLASS}>
								{leftComponents.length ? (
									leftComponents.map((component, index) =>
										renderComponentInstance(component, index, runtimeContext),
									)
								) : (
									<div className="text-center text-sm text-slate-500">
										No components provided.
									</div>
								)}
							</div>
						</Card>
						<Card className="overflow-hidden">
							<div className={SPLIT_COLUMN_CLASS}>
								{rightComponents.length ? (
									rightComponents.map((component, index) =>
										renderComponentInstance(component, index, runtimeContext),
									)
								) : (
									<div className="text-center text-sm text-slate-500">
										No components provided.
									</div>
								)}
							</div>
						</Card>
					</div>
					{bottomComponents.length > 0 && (
						<div className="flex justify-center">
							<div className="space-y-4">
								{bottomComponents.map((component, index) =>
									renderComponentInstance(component, index, runtimeContext),
								)}
							</div>
						</div>
					)}
				</div>
			</div>
		);
	}

	const visibleComponents =
		page.components?.filter((c) => isComponentVisible(c, sessionState ?? {})) ??
		[];

	return (
		<div key={page.id} className="page-enter flex justify-center">
			<Card className="w-full max-w-3xl">
				<CardContent className="space-y-8">
					{visibleComponents.length ? (
						visibleComponents.map((component, index) =>
							renderComponentInstance(component, index, runtimeContext),
						)
					) : (
						<div className="text-center text-sm text-slate-500">
							No components provided for this page.
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}

function RuntimeComponentWrapper({
	component,
	context,
}: {
	component: ComponentInstance;
	context: RuntimeComponentContext;
}) {
	const renderer = getComponentRenderer(component.type);
	// A component written without a `props:` block compiles with no props;
	// renderers read component.props.* directly
	const withProps = useMemo(
		() => (component.props ? component : { ...component, props: {} }),
		[component],
	) as ComponentInstance;
	return <>{renderer({ component: withProps, context })}</>;
}

function renderComponentInstance(
	component: ComponentInstance,
	index: number,
	context: RuntimeComponentContext,
) {
	return (
		<RuntimeComponentWrapper
			key={`${component.type}-${index}`}
			component={component}
			context={context}
		/>
	);
}
