import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
	children: ReactNode;
};

type State = {
	hasError: boolean;
	error: Error | null;
};

export class ErrorBoundary extends Component<Props, State> {
	constructor(props: Props) {
		super(props);
		this.state = { hasError: false, error: null };
	}

	static getDerivedStateFromError(error: Error): State {
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		console.error("[ErrorBoundary]", error, info.componentStack);
	}

	render() {
		if (this.state.hasError) {
			return (
				<div className="flex min-h-screen items-center justify-center bg-slate-50 p-8">
					<div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
						<h2 className="mb-2 text-lg font-semibold text-slate-900">
							Something went wrong
						</h2>
						<p className="mb-4 text-sm text-slate-500">
							An unexpected error occurred. Please try refreshing the page.
						</p>
						<button
							type="button"
							className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
							onClick={() => window.location.reload()}
						>
							Refresh page
						</button>
					</div>
				</div>
			);
		}

		return this.props.children;
	}
}
