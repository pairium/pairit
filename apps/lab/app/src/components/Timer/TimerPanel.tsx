/**
 * TimerPanel - Presentational component for countdown timer
 * Shows countdown, progress bar, and status with color transitions
 */

export type TimerStatus = "running" | "warning" | "expired";

export type TimerPanelProps = {
	duration: number;
	remaining: number;
	status: TimerStatus;
	visible: boolean;
};

export function TimerPanel({
	duration,
	remaining,
	status,
	visible,
}: TimerPanelProps) {
	if (!visible) return null;

	const progress =
		duration > 0 ? ((duration - remaining) / duration) * 100 : 100;

	const colorMap = {
		running: {
			icon: "text-blue-600",
			iconBg: "bg-blue-100",
			bar: "bg-blue-500",
			label: "text-blue-600",
		},
		warning: {
			icon: "text-amber-600",
			iconBg: "bg-amber-100",
			bar: "bg-amber-500",
			label: "text-amber-600",
		},
		expired: {
			icon: "text-red-600",
			iconBg: "bg-red-100",
			bar: "bg-red-500",
			label: "text-red-600",
		},
	};

	const colors = colorMap[status];

	return (
		<div className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-6">
			<div className="flex flex-col items-center gap-4">
				<div
					className={`flex h-16 w-16 items-center justify-center rounded-full ${colors.iconBg}`}
				>
					<svg
						className={`h-8 w-8 ${colors.icon}`}
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
					<p className="text-3xl font-semibold tabular-nums text-slate-900">
						{formatTime(remaining)}
					</p>
					<p className={`mt-1 text-sm font-medium ${colors.label}`}>
						{status === "expired"
							? "Time's up"
							: status === "warning"
								? "Almost out of time"
								: "Time remaining"}
					</p>
				</div>

				<div className="w-full">
					<div className="h-2 overflow-hidden rounded-full bg-slate-100">
						<div
							className={`h-full rounded-full ${colors.bar} transition-all duration-1000`}
							style={{ width: `${progress}%` }}
						/>
					</div>
				</div>
			</div>
		</div>
	);
}

function formatTime(seconds: number): string {
	const mins = Math.floor(seconds / 60);
	const secs = seconds % 60;
	return `${mins}:${secs.toString().padStart(2, "0")}`;
}
