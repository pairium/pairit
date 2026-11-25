import { mergeNestedUpdates } from "@app/lib/state-path";
import { Card, CardContent } from "@components/ui/Card";

import {
	type CSSProperties,
	type ReactNode,
	useCallback,
	useMemo,
	useRef,
} from "react";
import { evaluateExpression, type GroupView, type Scope } from "./expression";
import {
	getComponentRenderer,
	type NavigationGuard,
	type RuntimeComponentContext,
} from "./registry";
import type { ButtonAction, ComponentInstance, Page } from "./types";

// A chat or html embed (including a custom workspace renderer) in a split
// column fills the column: it drops its fixed height and its own border,
// and cancels the column padding to sit flush with the card edges.
const SPLIT_COLUMN_CLASS = [
	"flex h-full flex-col gap-4 p-4",
	"[&>[data-chat]]:h-auto [&>[data-chat]]:min-h-0 [&>[data-chat]]:flex-1",
	"[&>[data-chat]]:-mx-4 [&>[data-chat]]:rounded-none [&>[data-chat]]:border-0",
	"[&>[data-chat]:first-child]:-mt-4 [&>[data-chat]:last-child]:-mb-4",
	"[&>[data-html]]:min-h-0 [&>[data-html]]:flex-1 [&>[data-html]]:-mx-4",
	"[&>[data-html]:first-child]:-mt-4 [&>[data-html]:last-child]:-mb-4",
	"[&>[data-html]_iframe]:h-auto [&>[data-html]_iframe]:min-h-0 [&>[data-html]_iframe]:flex-1",
	"[&>[data-html]_iframe]:rounded-none [&>[data-html]_iframe]:border-0",
	"[&>[data-html]>p]:px-4 [&>[data-html]:last-child>p]:pb-3",
].join(" ");

function isComponentVisible(
	component: ComponentInstance,
	scope: Scope,
): boolean {
	if (!component.when) return true;
	return evaluateExpression(component.when, scope);
}

export function getVisibleComponents(
	page: Page,
	scope: Scope,
): ComponentInstance[] {
	return page.components?.filter((c) => isComponentVisible(c, scope)) ?? [];
}

function resolveTarget(action: ButtonAction, scope: Scope): string {
	if (action.target) return action.target;
	if (!action.branches) throw new Error("No target or branches");

	for (const branch of action.branches) {
		if (!branch.when) return branch.target; // default branch
		if (evaluateExpression(branch.when, scope)) {
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
	group?: GroupView;
	onSessionStateChange?: (updates: Record<string, unknown>) => void;
	compiledConfig?: import("./config").CompiledConfig | null;
	isNavigating?: boolean;
	footer?: ReactNode;
}

export function PageRenderer({
	page,
	onAction,
	sessionId,
	sessionState,
	group,
	onSessionStateChange,
	compiledConfig,
	isNavigating,
	footer,
}: PageRendererProps) {
	const guardsRef = useRef<Set<NavigationGuard>>(new Set());
	const sessionStateRef = useRef<Record<string, unknown>>(sessionState ?? {});
	const groupRef = useRef(group);

	// Keep refs in sync with props
	sessionStateRef.current = sessionState ?? {};
	groupRef.current = group;
	const scope: Scope = { session_state: sessionState ?? {}, group };

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
				const target = resolveTarget(action, {
					session_state: sessionStateRef.current,
					group: groupRef.current,
				});
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
			const target = resolveTarget(action, {
				session_state: sessionStateRef.current,
				group: groupRef.current,
			});
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
			group,
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
			group,
			wrappedOnSessionStateChange,
			page.id,
			compiledConfig,
			isNavigating,
		],
	);

	if (page.layout === "split") {
		const visibleComponents =
			page.components?.filter((c) => isComponentVisible(c, scope)) ?? [];
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

		const customHeight =
			typeof page.height === "number" &&
			Number.isFinite(page.height) &&
			page.height > 0
				? page.height
				: null;
		const splitHeightClass =
			customHeight !== null
				? "h-(--split-height)"
				: bottomComponents.length > 0
					? "h-[calc(100vh-10rem)] min-h-[28rem]"
					: "h-[calc(100vh-6.5rem)] min-h-[28rem]";

		return (
			<div key={page.id} className="page-enter flex justify-center">
				<div className="w-full max-w-7xl space-y-4">
					<div
						className={`grid ${splitHeightClass} grid-cols-2 gap-4`}
						style={
							customHeight !== null
								? ({ "--split-height": `${customHeight}px` } as CSSProperties)
								: undefined
						}
					>
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
					{footer}
				</div>
			</div>
		);
	}

	const visibleComponents = getVisibleComponents(page, scope);
	const cardWidthClass = page.width === "wide" ? "max-w-5xl" : "max-w-3xl";

	return (
		<div key={page.id} className="page-enter flex justify-center">
			<Card className={`w-full ${cardWidthClass}`}>
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
					{footer}
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
