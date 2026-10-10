/**
 * Matchmaking Runtime - Connects MatchmakingPanel to the runtime system
 * Handles matchmaking API calls, SSE subscriptions, and state management
 */

import { cancelMatchmaking, joinMatchmaking } from "@app/lib/api";
import { sseClient } from "@app/lib/sse";
import { defineRuntimeComponent } from "@app/runtime/define-runtime-component";
import { useCallback, useEffect, useRef, useState } from "react";
import { MatchmakingPanel, type MatchmakingStatus } from "./MatchmakingPanel";

type MatchmakingProps = {
	poolId?: string;
	num_users?: number;
	timeoutSeconds?: number;
	timeoutTarget?: string;
	assignmentType?: "random" | "balanced_random" | "block";
	conditions?: string[];
	onMatchTarget?: string;
};

type SSEMatchFound = {
	groupId: string;
	treatment: string;
	memberCount: number;
};

type SSEMatchTimeout = {
	poolId: string;
	timeoutTarget?: string;
};

export const MatchmakingRuntime = defineRuntimeComponent<
	"matchmaking",
	MatchmakingProps
>({
	type: "matchmaking",
	renderer: ({ component, context }) => {
		const { sessionId, onAction, onSessionStateChange } = context;
		const [status, setStatus] = useState<MatchmakingStatus>("connecting");
		const [currentCount, setCurrentCount] = useState(1);
		const [elapsedSeconds, setElapsedSeconds] = useState(0);

		const startTimeRef = useRef<number>(Date.now());
		const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
		const hasJoinedRef = useRef(false);
		const statusRef = useRef<MatchmakingStatus>("connecting");
		statusRef.current = status;

		// Apply defaults for optional props
		const poolId = component.props.poolId ?? "default";
		const targetCount = component.props.num_users ?? 2;
		const timeoutSeconds = component.props.timeoutSeconds ?? 120;
		const timeoutTarget = component.props.timeoutTarget;
		const assignmentType = component.props.assignmentType;
		const conditions = component.props.conditions;
		const onMatchTarget = component.props.onMatchTarget;

		// Handle match found
		const handleMatchFound = useCallback(
			(data: SSEMatchFound) => {
				console.log("[Matchmaking] Match found:", data);

				// Update status (stops the countdown)
				setStatus("matched");

				// Update session state
				if (onSessionStateChange) {
					onSessionStateChange({
						group_id: data.groupId,
						chat_group_id: data.groupId,
						treatment: data.treatment,
					});
				}

				// Navigate to target after brief delay
				if (onMatchTarget) {
					navTimerRef.current = setTimeout(() => {
						onAction({ type: "go_to", target: onMatchTarget });
					}, 1500);
				}
			},
			[onAction, onSessionStateChange, onMatchTarget],
		);

		// Handle match timeout
		const handleMatchTimeout = useCallback(
			(data: SSEMatchTimeout) => {
				console.log("[Matchmaking] Match timeout:", data);

				// Update status (stops the countdown)
				setStatus("timeout");

				// Navigate to timeout target after brief delay
				const target = data.timeoutTarget || timeoutTarget;
				if (target) {
					navTimerRef.current = setTimeout(() => {
						onAction({ type: "go_to", target });
					}, 2000);
				}
			},
			[onAction, timeoutTarget],
		);

		// Join matchmaking on mount
		useEffect(() => {
			if (!sessionId || hasJoinedRef.current) return;
			hasJoinedRef.current = true;

			const currentSessionId = sessionId;

			async function join() {
				try {
					const result = await joinMatchmaking(currentSessionId, {
						poolId,
						num_users: targetCount,
						timeoutSeconds,
						timeoutTarget,
						assignmentType,
						conditions,
					});

					if (result.status === "waiting") {
						setStatus("waiting");
						setCurrentCount(result.position);
						startTimeRef.current = Date.now();
					} else if (result.status === "matched") {
						// Immediate match (rare, but handle it)
						handleMatchFound({
							groupId: result.groupId,
							treatment: result.treatment,
							memberCount: targetCount,
						});
					}
				} catch (error) {
					console.error("[Matchmaking] Failed to join:", error);
					setStatus("error");
				}
			}

			join();
		}, [
			sessionId,
			poolId,
			targetCount,
			timeoutSeconds,
			timeoutTarget,
			assignmentType,
			conditions,
			handleMatchFound,
		]);

		// Countdown while waiting, with a client-side timeout in case the
		// match_timeout event is missed. Kept separate from the join effect,
		// whose dependencies change on re-render and would clear the interval.
		useEffect(() => {
			if (status !== "waiting") return;
			const interval = setInterval(() => {
				const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
				setElapsedSeconds(elapsed);
				if (elapsed >= timeoutSeconds) {
					clearInterval(interval);
					handleMatchTimeout({ poolId, timeoutTarget });
				}
			}, 1000);
			return () => clearInterval(interval);
		}, [status, timeoutSeconds, poolId, timeoutTarget, handleMatchTimeout]);

		// Cancel a pending navigation only on unmount
		useEffect(() => {
			return () => {
				if (navTimerRef.current) {
					clearTimeout(navTimerRef.current);
					navTimerRef.current = null;
				}
			};
		}, []);

		// Subscribe to SSE events
		useEffect(() => {
			if (!sessionId) return;

			const unsubscribeFound = sseClient.on("match_found", (data) => {
				handleMatchFound(data as SSEMatchFound);
			});

			const unsubscribeTimeout = sseClient.on("match_timeout", (data) => {
				handleMatchTimeout(data as SSEMatchTimeout);
			});

			return () => {
				unsubscribeFound();
				unsubscribeTimeout();
			};
		}, [sessionId, handleMatchFound, handleMatchTimeout]);

		// Rejoin when the stream reconnects while waiting. The server may have
		// dropped us from the pool (restart, long disconnect) or matched us while
		// the stream was down, in which case match_found was never delivered.
		useEffect(() => {
			if (!sessionId) return;
			const currentSessionId = sessionId;

			return sseClient.on("connected", () => {
				if (statusRef.current !== "waiting") return;
				const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
				const remaining = timeoutSeconds - elapsed;
				if (remaining <= 0) return;

				joinMatchmaking(currentSessionId, {
					poolId,
					num_users: targetCount,
					timeoutSeconds: remaining,
					timeoutTarget,
					assignmentType,
					conditions,
				})
					.then((result) => {
						if (statusRef.current !== "waiting") return;
						if (result.status === "matched") {
							handleMatchFound({
								groupId: result.groupId,
								treatment: result.treatment,
								memberCount: targetCount,
							});
						} else {
							setCurrentCount(result.position);
						}
					})
					.catch((error) => {
						console.error("[Matchmaking] Failed to rejoin:", error);
					});
			});
		}, [
			sessionId,
			poolId,
			targetCount,
			timeoutSeconds,
			timeoutTarget,
			assignmentType,
			conditions,
			handleMatchFound,
		]);

		// Handle cancel
		const handleCancel = useCallback(async () => {
			if (!sessionId) return;

			try {
				await cancelMatchmaking(sessionId, poolId);
				setStatus("timeout");

				// Navigate to timeout target if available
				if (timeoutTarget) {
					onAction({ type: "go_to", target: timeoutTarget });
				}
			} catch (error) {
				console.error("[Matchmaking] Failed to cancel:", error);
			}
		}, [sessionId, poolId, timeoutTarget, onAction]);

		if (!sessionId) {
			return (
				<div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
					Matchmaking requires an active session.
				</div>
			);
		}

		return (
			<MatchmakingPanel
				status={status}
				currentCount={currentCount}
				targetCount={targetCount}
				timeoutSeconds={timeoutSeconds}
				elapsedSeconds={elapsedSeconds}
				onCancel={status === "waiting" ? handleCancel : undefined}
			/>
		);
	},
});
