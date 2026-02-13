/**
 * MatchmakingPanel - Presentational component for matchmaking UI
 * Shows waiting state, countdown, and match status
 */

export type MatchmakingStatus =
	| "connecting"
	| "waiting"
	| "matched"
	| "timeout"
	| "error";

export type MatchmakingPanelProps = {
	status: MatchmakingStatus;
	currentCount: number;
	targetCount: number;
	timeoutSeconds: number;
	elapsedSeconds: number;
	groupId?: string;
	treatment?: string;
	onCancel?: () => void;
};

export function MatchmakingPanel({
	status,
	currentCount,
	targetCount,
	timeoutSeconds,
	elapsedSeconds,
	groupId,
	treatment,
	onCancel,
}: MatchmakingPanelProps) {
	const remainingSeconds = Math.max(0, timeoutSeconds - elapsedSeconds);

	return (
		<div className="mx-auto flex max-w-md flex-col items-center gap-6 rounded-2xl border border-slate-200 bg-white p-8">
			{status === "connecting" && (
				<>
					<div className="flex h-16 w-16 items-center justify-center">
						<div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-500" />
					</div>
					<div className="text-center">
						<h2 className="text-lg font-semibold text-slate-900">
							Connecting...
						</h2>
						<p className="mt-1 text-sm text-slate-500">
							Setting up matchmaking
						</p>
					</div>
				</>
			)}

			{status === "waiting" && (
				<>
					<div className="flex h-16 w-16 items-center justify-center">
						<div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-500" />
					</div>
					<div className="text-center">
						<h2 className="text-lg font-semibold text-slate-900">
							Finding participants...
						</h2>
						<p className="mt-1 text-sm text-slate-500">
							Waiting for {targetCount - currentCount} more participant
							{targetCount - currentCount !== 1 ? "s" : ""}
						</p>
					</div>
					<div className="w-full">
						<div className="mb-2 flex justify-between text-sm text-slate-500">
							<span>
								{currentCount} / {targetCount} joined
							</span>
							<span>{formatTime(remainingSeconds)}</span>
						</div>
						<div className="h-2 overflow-hidden rounded-full bg-slate-100">
							<div
								className="h-full rounded-full bg-blue-500 transition-all duration-1000"
								style={{
									width: `${(elapsedSeconds / timeoutSeconds) * 100}%`,
								}}
							/>
						</div>
					</div>
					{onCancel && (
						<button
							type="button"
							onClick={onCancel}
							className="text-sm text-slate-500 underline hover:text-slate-700"
						>
							Cancel
						</button>
					)}
				</>
			)}

			{status === "matched" && (
				<>
					<div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
						<svg
							className="h-8 w-8 text-green-600"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							aria-hidden="true"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M5 13l4 4L19 7"
							/>
						</svg>
					</div>
					<div className="text-center">
						<h2 className="text-lg font-semibold text-slate-900">
							Match found!
						</h2>
						<p className="mt-1 text-sm text-slate-500">
							You've been matched with other participants
						</p>
					</div>
					{(groupId || treatment) && (
						<div className="w-full rounded-lg bg-slate-50 p-3 text-sm">
							{groupId && (
								<p className="text-slate-600">
									<span className="font-medium">Group:</span>{" "}
									{groupId.slice(0, 8)}...
								</p>
							)}
							{treatment && (
								<p className="text-slate-600">
									<span className="font-medium">Condition:</span> {treatment}
								</p>
							)}
						</div>
					)}
				</>
			)}

			{status === "timeout" && (
				<>
					<div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
						<svg
							className="h-8 w-8 text-amber-600"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							aria-hidden="true"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
					</div>
					<div className="text-center">
						<h2 className="text-lg font-semibold text-slate-900">
							Matchmaking timed out
						</h2>
						<p className="mt-1 text-sm text-slate-500">
							Not enough participants joined in time
						</p>
					</div>
				</>
			)}

			{status === "error" && (
				<>
					<div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
						<svg
							className="h-8 w-8 text-red-600"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							aria-hidden="true"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
					</div>
					<div className="text-center">
						<h2 className="text-lg font-semibold text-slate-900">
							Something went wrong
						</h2>
						<p className="mt-1 text-sm text-slate-500">
							Unable to join matchmaking
						</p>
					</div>
				</>
			)}
		</div>
	);
}

function formatTime(seconds: number): string {
	const mins = Math.floor(seconds / 60);
	const secs = seconds % 60;
	return `${mins}:${secs.toString().padStart(2, "0")}`;
}
