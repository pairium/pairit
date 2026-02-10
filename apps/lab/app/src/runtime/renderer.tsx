import { Card, CardContent } from "@components/ui/Card";

import { Fragment, useCallback, useMemo, useRef } from "react";
import {
	getComponentRenderer,
	type NavigationGuard,
	type RuntimeComponentContext,
} from "./registry";
import type { ButtonsComponent, ComponentInstance, Page } from "./types";

type ButtonAction = ButtonsComponent["props"]["buttons"][number]["action"];

interface PageRendererProps {
	page: Page;
	onAction: (action: ButtonAction) => Promise<void> | void;
	sessionId?: string | null;
}

export function PageRenderer({ page, onAction, sessionId }: PageRendererProps) {
	const guardsRef = useRef<Set<NavigationGuard>>(new Set());

	const registerNavigationGuard = useCallback((guard: NavigationGuard) => {
		guardsRef.current.add(guard);
		return () => {
			guardsRef.current.delete(guard);
		};
	}, []);

	const guardedAction = useCallback(
		async (action: ButtonAction) => {
			if (action.skipValidation) {
				await onAction(action);
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
			await onAction(action);
		},
		[onAction],
	);

	const runtimeContext: RuntimeComponentContext = useMemo(
		() => ({
			onAction: guardedAction,
			registerNavigationGuard,
			sessionId,
		}),
		[guardedAction, registerNavigationGuard, sessionId],
	);

	return (
		<div className="flex justify-center">
			<Card className="w-full max-w-3xl">
				<CardContent className="space-y-8">
					{page?.components?.length ? (
						page.components.map((component, index) =>
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

function renderComponentInstance(
	component: ComponentInstance,
	index: number,
	context: RuntimeComponentContext,
) {
	const renderer = getComponentRenderer(component.type);
	return (
		<Fragment key={`${component.type}-${index}`}>
			{renderer({ component, context })}
		</Fragment>
	);
}
