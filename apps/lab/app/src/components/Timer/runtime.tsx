/**
 * Timer Runtime - Countdown timer with auto-navigation on expiry
 * Handles wall-clock timing, warning threshold, event emission, and action dispatch
 */

import { submitEvent, updateState } from "@app/lib/api";
import { defineRuntimeComponent } from "@app/runtime/define-runtime-component";
import type { ButtonAction } from "@app/runtime/types";
import { useEffect, useRef, useState } from "react";
import { TimerPanel, type TimerStatus } from "./TimerPanel";

type TimerProps = {
	duration: number;
	warning?: number;
	visible?: boolean;
	action?: ButtonAction;
	runningLabel?: string;
	warningLabel?: string;
	expiredLabel?: string;
};

export const TimerRuntime = defineRuntimeComponent<"timer", TimerProps>({
	type: "timer",
	renderer: ({ component, context }) => {
		const { onAction } = context;

		const duration = Math.max(0, Math.floor(component.props.duration));
		const warningThreshold = component.props.warning;
		const visible = component.props.visible ?? true;
		const action = component.props.action;

		const [elapsedSeconds, setElapsedSeconds] = useState(0);
		const [status, setStatus] = useState<TimerStatus>(
			duration === 0 ? "expired" : "running",
		);

		const hasStartedRef = useRef(false);
		const mountTimeRef = useRef<number>(0);
		const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
		const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
		const hasWarnedRef = useRef(false);
		const hasExpiredRef = useRef(false);

		// Keep stable refs for values used inside the effect but that shouldn't restart it
		const componentRef = useRef(component);
		componentRef.current = component;
		const contextRef = useRef(context);
		contextRef.current = context;
		const onActionRef = useRef(onAction);
		onActionRef.current = onAction;

		const remaining = Math.max(0, duration - elapsedSeconds);

		useEffect(() => {
			if (hasStartedRef.current) return;
			hasStartedRef.current = true;

			mountTimeRef.current = Date.now();

			// Emit onStart event
			emitEvent("onStart", componentRef.current, contextRef.current);

			// Handle zero-duration: expire immediately
			if (duration === 0) {
				hasExpiredRef.current = true;
				emitEvent("onExpiry", componentRef.current, contextRef.current);
				if (action) {
					applySetState(action, contextRef.current);
					timeoutRef.current = setTimeout(() => {
						onActionRef.current(action);
					}, 500);
				}
				return;
			}

			intervalRef.current = setInterval(() => {
				const elapsed = Math.floor((Date.now() - mountTimeRef.current) / 1000);
				setElapsedSeconds(elapsed);

				const rem = Math.max(0, duration - elapsed);

				// Warning check
				if (
					warningThreshold != null &&
					rem <= warningThreshold &&
					!hasWarnedRef.current
				) {
					hasWarnedRef.current = true;
					setStatus("warning");
					emitEvent("onWarning", componentRef.current, contextRef.current);
				}

				// Expiry check
				if (elapsed >= duration && !hasExpiredRef.current) {
					hasExpiredRef.current = true;

					if (intervalRef.current) {
						clearInterval(intervalRef.current);
						intervalRef.current = null;
					}

					setStatus("expired");
					emitEvent("onExpiry", componentRef.current, contextRef.current);

					if (action) {
						applySetState(action, contextRef.current);
						timeoutRef.current = setTimeout(() => {
							onActionRef.current(action);
						}, 500);
					}
				}
			}, 1000);

			return () => {
				hasStartedRef.current = false;
				hasWarnedRef.current = false;
				hasExpiredRef.current = false;
				if (intervalRef.current) {
					clearInterval(intervalRef.current);
					intervalRef.current = null;
				}
				if (timeoutRef.current) {
					clearTimeout(timeoutRef.current);
					timeoutRef.current = null;
				}
			};
		}, [duration, warningThreshold, action]);

		return (
			<TimerPanel
				duration={duration}
				remaining={remaining}
				status={status}
				visible={visible}
				runningLabel={component.props.runningLabel}
				warningLabel={component.props.warningLabel}
				expiredLabel={component.props.expiredLabel}
			/>
		);
	},
});

function applySetState(
	action: ButtonAction,
	context: {
		sessionId?: string | null;
		onSessionStateChange?: (updates: Record<string, unknown>) => void;
	},
) {
	if (!action.setState || !context.sessionId) return;
	updateState(context.sessionId, action.setState).catch((error) => {
		console.error("[Timer] Failed to apply setState", error);
	});
	context.onSessionStateChange?.(action.setState);
}

function emitEvent(
	eventName: "onStart" | "onWarning" | "onExpiry",
	component: {
		id?: string;
		events?: Record<string, { type?: string; data?: Record<string, unknown> }>;
	},
	context: { sessionId?: string | null },
) {
	if (!context.sessionId) return;

	const eventConfig = component.events?.[eventName];

	submitEvent(context.sessionId, {
		type: eventConfig?.type ?? eventName,
		timestamp: new Date().toISOString(),
		componentType: "timer",
		componentId: component.id ?? "unknown",
		data: {
			event: eventName,
			...eventConfig?.data,
		},
	}).catch((error) => {
		console.error(`[Timer] Failed to submit ${eventName} event`, error);
	});
}
