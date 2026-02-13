/**
 * RandomizationPanel - Presentational component for randomization UI
 * Shows loading state and assignment result
 */

export type RandomizationStatus = "loading" | "assigned" | "error";

export type RandomizationPanelProps = {
	status: RandomizationStatus;
	condition?: string;
	showAssignment?: boolean;
};

export function RandomizationPanel({
	status,
	condition,
	showAssignment = true,
}: RandomizationPanelProps) {
	return (
		<div className="mx-auto flex max-w-md flex-col items-center gap-6 rounded-2xl border border-slate-200 bg-white p-8">
			{status === "loading" && (
				<>
					<div className="flex h-16 w-16 items-center justify-center">
						<div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-500" />
					</div>
					<div className="text-center">
						<h2 className="text-lg font-semibold text-slate-900">
							Assigning condition...
						</h2>
						<p className="mt-1 text-sm text-slate-500">
							Please wait while we set up your session
						</p>
					</div>
				</>
			)}

			{status === "assigned" && showAssignment && condition && (
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
							Condition assigned
						</h2>
						<p className="mt-1 text-sm text-slate-500">
							You have been assigned to a condition
						</p>
					</div>
					<div className="w-full rounded-lg bg-slate-50 p-3 text-sm">
						<p className="text-slate-600">
							<span className="font-medium">Condition:</span> {condition}
						</p>
					</div>
				</>
			)}

			{status === "assigned" && !showAssignment && (
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
							Setup complete
						</h2>
						<p className="mt-1 text-sm text-slate-500">Continuing...</p>
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
							Unable to assign condition
						</p>
					</div>
				</>
			)}
		</div>
	);
}
