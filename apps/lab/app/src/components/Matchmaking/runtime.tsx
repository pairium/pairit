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
		const { sessionId, onAction, onUserStateChange } = context;
		const [status, setStatus] = useState<MatchmakingStatus>("connecting");
		const [currentCount, setCurrentCount] = useState(1);
		const [elapsedSeconds, setElapsedSeconds] = useState(0);
		const [matchResult, setMatchResult] = useState<{
			groupId?: string;
			treatment?: string;
		}>({});

		const startTimeRef = useRef<number>(Date.now());
		const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
		const hasJoinedRef = useRef(false);

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

				// Stop timer
				if (timerRef.current) {
					clearInterval(timerRef.current);
					timerRef.current = null;
				}

				// Update status
				setStatus("matched");
				setMatchResult({
					groupId: data.groupId,
					treatment: data.treatment,
				});

				// Update user state
				if (onUserStateChange) {
					onUserStateChange({
						group_id: data.groupId,
						chat_group_id: data.groupId,
						treatment: data.treatment,
					});
				}

				// Navigate to target after brief delay
				if (onMatchTarget) {
					setTimeout(() => {
						onAction({ type: "go_to", target: onMatchTarget });
					}, 1500);
				}
			},
			[onAction, onUserStateChange, onMatchTarget],
		);

		// Handle match timeout
		const handleMatchTimeout = useCallback(
			(data: SSEMatchTimeout) => {
				console.log("[Matchmaking] Match timeout:", data);

				// Stop timer
				if (timerRef.current) {
					clearInterval(timerRef.current);
					timerRef.current = null;
				}

				// Update status
				setStatus("timeout");

				// Navigate to timeout target after brief delay
				const target = data.timeoutTarget || timeoutTarget;
				if (target) {
					setTimeout(() => {
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

						// Start countdown timer with client-side timeout fallback
						timerRef.current = setInterval(() => {
							const elapsed = Math.floor(
								(Date.now() - startTimeRef.current) / 1000,
							);
							setElapsedSeconds(elapsed);

							// Client-side timeout fallback (in case SSE event is missed)
							if (elapsed >= timeoutSeconds && timerRef.current) {
								clearInterval(timerRef.current);
								timerRef.current = null;
								handleMatchTimeout({ poolId, timeoutTarget });
							}
						}, 1000);
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

			return () => {
				if (timerRef.current) {
					clearInterval(timerRef.current);
					timerRef.current = null;
				}
			};
		}, [
			sessionId,
			poolId,
			targetCount,
			timeoutSeconds,
			timeoutTarget,
			assignmentType,
			conditions,
			handleMatchFound,
			handleMatchTimeout,
		]);

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

		// Handle cancel
		const handleCancel = useCallback(async () => {
			if (!sessionId) return;

			try {
				await cancelMatchmaking(sessionId, poolId);

				// Stop timer
				if (timerRef.current) {
					clearInterval(timerRef.current);
					timerRef.current = null;
				}

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
				groupId={matchResult.groupId}
				treatment={matchResult.treatment}
				onCancel={status === "waiting" ? handleCancel : undefined}
			/>
		);
	},
});
