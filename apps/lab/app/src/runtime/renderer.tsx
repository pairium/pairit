import { Card, CardContent } from "@components/ui/Card";

import { useCallback, useMemo, useRef } from "react";
import { evaluateExpression } from "./expression";
import {
	getComponentRenderer,
	type NavigationGuard,
	type RuntimeComponentContext,
} from "./registry";
import type { ButtonAction, ComponentInstance, Page } from "./types";

function isComponentVisible(
	component: ComponentInstance,
	userState: Record<string, unknown>,
): boolean {
	if (!component.when) return true;
	return evaluateExpression(component.when, { user_state: userState });
}

function resolveTarget(
	action: ButtonAction,
	userState: Record<string, unknown>,
): string {
	if (action.target) return action.target;
	if (!action.branches) throw new Error("No target or branches");

	for (const branch of action.branches) {
		if (!branch.when) return branch.target; // default branch
		if (evaluateExpression(branch.when, { user_state: userState })) {
			return branch.target;
		}
	}
	throw new Error("No matching branch");
}

interface PageRendererProps {
	page: Page;
	onAction: (action: ButtonAction) => Promise<void> | void;
	sessionId?: string | null;
	userState?: Record<string, unknown>;
	onUserStateChange?: (updates: Record<string, unknown>) => void;
}

export function PageRenderer({
	page,
	onAction,
	sessionId,
	userState,
	onUserStateChange,
}: PageRendererProps) {
	const guardsRef = useRef<Set<NavigationGuard>>(new Set());
	const userStateRef = useRef<Record<string, unknown>>(userState ?? {});

	// Keep ref in sync with prop
	userStateRef.current = userState ?? {};

	const registerNavigationGuard = useCallback((guard: NavigationGuard) => {
		guardsRef.current.add(guard);
		return () => {
			guardsRef.current.delete(guard);
		};
	}, []);

	// Wrap onUserStateChange to also update ref immediately (before React re-renders)
	const wrappedOnUserStateChange = useCallback(
		(updates: Record<string, unknown>) => {
			userStateRef.current = { ...userStateRef.current, ...updates };
			onUserStateChange?.(updates);
		},
		[onUserStateChange],
	);

	const guardedAction = useCallback(
		async (action: ButtonAction) => {
			if (action.skipValidation) {
				// Resolve target using current userState
				const target = resolveTarget(action, userStateRef.current);
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
			// Resolve target AFTER guards have run (they may have updated userState)
			const target = resolveTarget(action, userStateRef.current);
			await onAction({ ...action, target });
		},
		[onAction],
	);

	const runtimeContext: RuntimeComponentContext = useMemo(
		() => ({
			onAction: guardedAction,
			registerNavigationGuard,
			sessionId,
			userState,
			onUserStateChange: wrappedOnUserStateChange,
			pageId: page.id,
		}),
		[
			guardedAction,
			registerNavigationGuard,
			sessionId,
			userState,
			wrappedOnUserStateChange,
			page.id,
		],
	);

	if (page.layout === "split") {
		const visibleComponents =
			page.components?.filter((c) => isComponentVisible(c, userState ?? {})) ??
			[];
		const leftComponents = visibleComponents.filter(
			(c) => c.type !== "live-workspace" && c.type !== "buttons",
		);
		const rightComponents = visibleComponents.filter(
			(c) => c.type === "live-workspace",
		);
		const bottomComponents = visibleComponents.filter(
			(c) => c.type === "buttons",
		);

		return (
			<div className="flex justify-center">
				<div className="w-full max-w-6xl space-y-4">
					<div className="grid h-[calc(100vh-14rem)] grid-cols-2 gap-4">
						<Card className="overflow-hidden">
							<CardContent className="flex h-full flex-col space-y-4 p-4">
								{leftComponents.length ? (
									leftComponents.map((component, index) =>
										renderComponentInstance(component, index, runtimeContext),
									)
								) : (
									<div className="text-center text-sm text-slate-500">
										No components provided.
									</div>
								)}
							</CardContent>
						</Card>
						<Card className="overflow-hidden">
							<CardContent className="flex h-full flex-col p-4">
								{rightComponents.length ? (
									rightComponents.map((component, index) =>
										renderComponentInstance(component, index, runtimeContext),
									)
								) : (
									<div className="text-center text-sm text-slate-500">
										No workspace component provided.
									</div>
								)}
							</CardContent>
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
		page.components?.filter((c) => isComponentVisible(c, userState ?? {})) ??
		[];

	return (
		<div className="flex justify-center">
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
	return <>{renderer({ component, context })}</>;
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
