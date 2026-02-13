/**
 * Randomization Runtime - Connects RandomizationPanel to the runtime system
 * Handles treatment assignment without matchmaking
 */

import { randomize } from "@app/lib/api";
import { defineRuntimeComponent } from "@app/runtime/define-runtime-component";
import { useEffect, useRef, useState } from "react";
import {
	RandomizationPanel,
	type RandomizationStatus,
} from "./RandomizationPanel";

type RandomizationProps = {
	assignmentType?: "random" | "balanced_random" | "block";
	conditions?: string[];
	stateKey?: string;
	target?: string;
	showAssignment?: boolean;
};

export const RandomizationRuntime = defineRuntimeComponent<
	"randomization",
	RandomizationProps
>({
	type: "randomization",
	renderer: ({ component, context }) => {
		const { sessionId, onAction, onUserStateChange } = context;
		const [status, setStatus] = useState<RandomizationStatus>("loading");
		const [condition, setCondition] = useState<string>();
		const hasCalledRef = useRef(false);

		const assignmentType = component.props.assignmentType ?? "random";
		const conditions = component.props.conditions ?? [];
		const stateKey = component.props.stateKey ?? "treatment";
		const target = component.props.target;
		const showAssignment = component.props.showAssignment ?? true;

		useEffect(() => {
			if (!sessionId || hasCalledRef.current) return;
			hasCalledRef.current = true;

			const currentSessionId = sessionId;

			async function assign() {
				try {
					const result = await randomize(currentSessionId, {
						assignmentType,
						conditions,
						stateKey,
					});

					console.log(
						`[Randomization] Assigned ${stateKey}: ${result.condition} (existing: ${result.existing})`,
					);

					setCondition(result.condition);
					setStatus("assigned");

					// Update local user state
					if (onUserStateChange) {
						onUserStateChange({ [stateKey]: result.condition });
					}

					// Auto-advance to target page if specified
					if (target) {
						const delay = showAssignment ? 1500 : 500;
						setTimeout(() => {
							onAction({ type: "go_to", target });
						}, delay);
					}
				} catch (error) {
					console.error("[Randomization] Failed to assign:", error);
					setStatus("error");
				}
			}

			assign();
		}, [
			sessionId,
			assignmentType,
			conditions,
			stateKey,
			target,
			showAssignment,
			onAction,
			onUserStateChange,
		]);

		if (!sessionId) {
			return (
				<div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
					Randomization requires an active session.
				</div>
			);
		}

		return (
			<RandomizationPanel
				status={status}
				condition={condition}
				showAssignment={showAssignment}
			/>
		);
	},
});
