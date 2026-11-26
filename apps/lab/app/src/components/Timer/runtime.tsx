/**
 * Timer Runtime - Server-backed countdown timer with auto-navigation on expiry
 * Anchors deadlines to server time (per-session or per-group), listens for
 * server-pushed `timer_expired` SSE events so minimized/throttled tabs advance
 * on time, and re-checks on `visibilitychange` and SSE reconnect.
 */

import { startTimer, submitEvent, updateState } from "@app/lib/api";
import { sseClient } from "@app/lib/sse";
import { defineRuntimeComponent } from "@app/runtime/define-runtime-component";
import type { ButtonAction } from "@app/runtime/types";
import { useEffect, useRef, useState } from "react";
import { TimerPanel, type TimerStatus } from "./TimerPanel";

type TimerProps = {
	duration: number;
	warning?: number;
	visible?: boolean;
	scope?: "session" | "group";
	key?: string;
	action?: ButtonAction;
	runningLabel?: string;
	warningLabel?: string;
	expiredLabel?: string;
};

type SSETimerExpired = {
	timerKey?: string;
	expiresAt?: number;
};

export const TimerRuntime = defineRuntimeComponent<"timer", TimerProps>({
	type: "timer",
	renderer: ({ component, context }) => {
		const { onAction, sessionId, pageId } = context;

		const duration = Math.max(0, Math.floor(component.props.duration));
		const warningThreshold = component.props.warning;
		const visible = component.props.visible ?? true;
		const componentId = component.id;
		const timerPropKey =
			typeof component.props.key === "string" ? component.props.key.trim() : "";

		const [remaining, setRemaining] = useState(duration);
		const [status, setStatus] = useState<TimerStatus>(
			duration === 0 ? "expired" : "running",
		);

		const expiresAtRef = useRef<number | null>(null);
		const clockOffsetRef = useRef<number>(0);
		const timerKeyRef = useRef<string | null>(null);
		const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
		const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
		const hasWarnedRef = useRef(false);
		const hasExpiredRef = useRef(false);
		const unmountedRef = useRef(false);

		// Keep stable refs for values used inside effects without restarting them
		const componentRef = useRef(component);
		componentRef.current = component;
		const contextRef = useRef(context);
		contextRef.current = context;
		const onActionRef = useRef(onAction);
		onActionRef.current = onAction;

		useEffect(() => {
			unmountedRef.current = false;
			hasWarnedRef.current = false;
			hasExpiredRef.current = false;
			timerKeyRef.current = timerPropKey
				? `key:${timerPropKey}`
				: pageId && componentId
					? `page:${pageId}:${componentId}`
					: null;
			clockOffsetRef.current = 0;

			setRemaining(duration);
			setStatus(duration === 0 ? "expired" : "running");

			// Emit onStart event
			emitEvent("onStart", componentRef.current, contextRef.current);

			const expire = () => {
				if (hasExpiredRef.current || unmountedRef.current) return;
				hasExpiredRef.current = true;

				if (intervalRef.current) {
					clearInterval(intervalRef.current);
					intervalRef.current = null;
				}

				setRemaining(0);
				setStatus("expired");
				emitEvent("onExpiry", componentRef.current, contextRef.current);

				const currentAction = componentRef.current.props.action;
				if (currentAction) {
					const statePromise = applySetState(currentAction, contextRef.current);
					const runAction = () => {
						if (unmountedRef.current) return;
						void onActionRef.current(currentAction);
					};

					// Hidden/minimized windows throttle setTimeout; advance as soon as
					// setState flushes instead of waiting on a throttled 500ms timer.
					if (typeof document !== "undefined" && document.hidden) {
						void statePromise.then(runAction);
					} else {
						const delayPromise = new Promise<void>((resolve) => {
							timeoutRef.current = setTimeout(() => {
								timeoutRef.current = null;
								resolve();
							}, 500);
						});
						void Promise.all([statePromise, delayPromise]).then(runAction);
					}
				}
			};

			// Handle zero-duration: expire immediately
			if (duration === 0) {
				expire();
				return () => {
					unmountedRef.current = true;
					if (timeoutRef.current) {
						clearTimeout(timeoutRef.current);
						timeoutRef.current = null;
					}
				};
			}

			// Start with an optimistic local deadline so UI renders immediately and
			// still works if the server call fails or there is no active session.
			expiresAtRef.current = Date.now() + duration * 1000;

			const tick = () => {
				if (
					hasExpiredRef.current ||
					unmountedRef.current ||
					expiresAtRef.current === null
				) {
					return;
				}

				const now = Date.now() + clockOffsetRef.current;
				const remainingMs = expiresAtRef.current - now;
				const rem = Math.min(
					duration,
					Math.max(0, Math.ceil(remainingMs / 1000)),
				);
				setRemaining(rem);

				if (remainingMs <= 0) {
					expire();
					return;
				}

				if (
					warningThreshold != null &&
					rem <= warningThreshold &&
					!hasWarnedRef.current
				) {
					hasWarnedRef.current = true;
					setStatus("warning");
					emitEvent("onWarning", componentRef.current, contextRef.current);
				}
			};

			// Sync deadline with the server so reloads, clock skew, and group phases stay aligned
			let synced = false;
			let syncing = false;
			const syncWithServer = () => {
				if (!sessionId || !pageId || synced || syncing) return;
				syncing = true;
				const requestSentAt = Date.now();
				void startTimer(sessionId, {
					pageId,
					componentId,
				})
					.then((res) => {
						if (unmountedRef.current || hasExpiredRef.current) return;
						synced = true;
						const responseReceivedAt = Date.now();
						const estimatedServerNow =
							res.serverNow + (responseReceivedAt - requestSentAt) / 2;
						clockOffsetRef.current = estimatedServerNow - responseReceivedAt;
						expiresAtRef.current = res.expiresAt;
						timerKeyRef.current = res.timerKey;
						tick();
					})
					.catch((error) => {
						console.error("[Timer] Failed to sync timer with server", error);
					})
					.finally(() => {
						syncing = false;
					});
			};
			syncWithServer();

			intervalRef.current = setInterval(tick, 1000);

			const unsubExpired = sseClient.on("timer_expired", (data) => {
				const payload = data as SSETimerExpired;
				if (timerKeyRef.current && payload?.timerKey === timerKeyRef.current) {
					expire();
				}
			});

			const unsubConnected = sseClient.on("connected", () => {
				if (!synced) syncWithServer();
				tick();
			});

			// Heartbeats arrive every 15s over SSE and wake hidden/throttled tabs
			// even if a server restart cleared an in-memory expiry broadcast.
			const unsubHeartbeat = sseClient.on("heartbeat", () => {
				tick();
			});

			const onVisibilityChange = () => {
				if (!document.hidden) {
					tick();
				}
			};
			if (typeof document !== "undefined") {
				document.addEventListener("visibilitychange", onVisibilityChange);
			}

			return () => {
				unmountedRef.current = true;
				unsubExpired();
				unsubConnected();
				unsubHeartbeat();
				if (typeof document !== "undefined") {
					document.removeEventListener("visibilitychange", onVisibilityChange);
				}
				if (intervalRef.current) {
					clearInterval(intervalRef.current);
					intervalRef.current = null;
				}
				if (timeoutRef.current) {
					clearTimeout(timeoutRef.current);
					timeoutRef.current = null;
				}
			};
		}, [
			duration,
			warningThreshold,
			sessionId,
			pageId,
			componentId,
			timerPropKey,
		]);

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
): Promise<void> {
	if (!action.setState) return Promise.resolve();
	context.onSessionStateChange?.(action.setState);
	if (!context.sessionId) return Promise.resolve();
	return updateState(context.sessionId, action.setState).catch((error) => {
		console.error("[Timer] Failed to apply setState", error);
	});
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
