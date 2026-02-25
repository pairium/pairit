/**
 * TimerPanel - Presentational component for countdown timer
 * Compact horizontal bar with clock icon, countdown, status label, and progress bar
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
		<div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white px-4 py-3">
			<div className="flex items-center gap-3">
				<div
					className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${colors.iconBg}`}
				>
					<svg
						className={`h-4 w-4 ${colors.icon}`}
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

				<span className="text-lg font-semibold tabular-nums text-slate-900">
					{formatTime(remaining)}
				</span>

				<span
					className={`w-36 shrink-0 text-sm font-medium ${colors.label}`}
				>
					{status === "expired"
						? "Time's up"
						: status === "warning"
							? "Almost out of time"
							: "remaining"}
				</span>

				<div className="min-w-0 flex-1">
					<div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
						<div
							className={`h-full rounded-full ${colors.bar} transition-[width] duration-1000 ease-linear`}
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
