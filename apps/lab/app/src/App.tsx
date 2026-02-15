import { Login } from "@components/Auth/Login";
import { Button } from "@components/ui/Button";
import { useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import Header from "./components/Header";
import {
	AuthRequiredError,
	advance,
	type ProlificParams,
	SessionBlockedError,
	startSession,
} from "./lib/api";
import { useSession } from "./lib/auth-client";
import { sseClient } from "./lib/sse";
import "./runtime"; // Register component renderers
import type { CompiledConfig } from "./runtime/config";
import { PageRenderer } from "./runtime/renderer";
import type { ButtonAction, Page } from "./runtime/types";

export default function App() {
	const { experimentId } = useParams({ from: "/$experimentId" });
	const { data: session, isPending: authLoading } = useSession();
	const isAuthenticated = !!session?.user;
	const [compiledConfig, setCompiledConfig] = useState<CompiledConfig | null>(
		null,
	);
	const [sessionId, setSessionId] = useState<string | null>(null);
	const [page, setPage] = useState<Page | null>(null);
	const [endedAt, setEndedAt] = useState<string | null>(null);
	const [endRedirectUrl, setEndRedirectUrl] = useState<string | null>(null);
	const [userState, setUserState] = useState<Record<string, unknown>>({});
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [authRequired, setAuthRequired] = useState(false);
	const [sessionBlocked, setSessionBlocked] = useState(false);

	useEffect(() => {
		let canceled = false;
		async function bootstrap() {
			if (authLoading) return;

			const searchParams = new URLSearchParams(window.location.search);
			const prolificPid = searchParams.get("PROLIFIC_PID");
			const studyId = searchParams.get("STUDY_ID");
			const prolificSessionId = searchParams.get("SESSION_ID");
			const prolific: ProlificParams | null =
				prolificPid && studyId && prolificSessionId
					? {
							prolificPid,
							studyId,
							sessionId: prolificSessionId,
						}
					: null;

			if (!experimentId) {
				setError("Missing experiment ID");
				return;
			}

			// Reset state
			setCompiledConfig(null);
			setSessionId(null);
			setPage(null);
			setEndedAt(null);
			setEndRedirectUrl(null);
			setUserState({});
			setAuthRequired(false);
			setSessionBlocked(false);
			setLoading(true);
			setError(null);

			try {
				const r = await startSession(experimentId, prolific);
				if (canceled) return;
				setCompiledConfig(r.config);
				setSessionId(r.sessionId);
				setPage(r.page);
				setEndRedirectUrl(r.page?.endRedirectUrl ?? null);
				setEndedAt(r.endedAt ?? null);
				if (r.user_state) setUserState(r.user_state);
			} catch (e: unknown) {
				if (canceled) return;

				if (e instanceof AuthRequiredError) {
					setAuthRequired(true);
					setLoading(false);
					return;
				}

				if (e instanceof SessionBlockedError) {
					setSessionBlocked(true);
					setLoading(false);
					return;
				}

				setError(e instanceof Error ? e.message : "Failed to start");
			} finally {
				if (!canceled) setLoading(false);
			}
		}
		bootstrap();
		return () => {
			canceled = true;
		};
	}, [experimentId, authLoading]);

	// Connect SSE when session is available
	useEffect(() => {
		if (!sessionId) return;
		sseClient.connect(sessionId);
		return () => sseClient.disconnect();
	}, [sessionId]);

	// Handle state_updated SSE events to sync userState
	useEffect(() => {
		if (!sessionId) return;

		const unsubscribe = sseClient.on("state_updated", (data: unknown) => {
			const { path, value } = data as { path: string; value: unknown };
			if (path) {
				setUserState((prev) => ({ ...prev, [path]: value }));
			}
		});

		return unsubscribe;
	}, [sessionId]);

	async function onAction(a: ButtonAction) {
		if (!a.target || !sessionId || !compiledConfig) return;

		const target = a.target;
		const nextPage = compiledConfig.pages[target];
		if (!nextPage) {
			setError(`Unknown target: ${target}`);
			return;
		}

		setLoading(true);
		setError(null);
		try {
			const r = await advance(sessionId, target);
			if (r.user_state) setUserState(r.user_state);
			(target);
			setPage(nextPage);
			setEndRedirectUrl(nextPage.endRedirectUrl ?? null);
			setEndedAt(nextPage.end ? new Date().toISOString() : null);
		} catch (error: unknown) {
			setError(error instanceof Error ? error.message : "Failed to advance");
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="min-h-screen bg-slate-50 text-slate-900">
			<Header sessionId={sessionId} />

			<main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 py-12">
				{error && (
					<div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
						{error}
					</div>
				)}

				{loading && (
					<div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
						Loading…
					</div>
				)}

				{!loading && authRequired && !isAuthenticated && (
					<div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-8 text-center">
						<div className="text-lg font-medium">Sign in to continue</div>
						<div className="text-sm text-slate-500">
							This experiment requires authentication.
						</div>
						<div className="flex justify-center">
							<Login />
						</div>
					</div>
				)}

				{!loading && sessionBlocked && (
					<div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-8 text-center">
						<div className="text-lg font-medium">
							Experiment Already Completed
						</div>
						<div className="text-sm text-slate-500">
							You have already completed this experiment and cannot retake it.
						</div>
					</div>
				)}

				{!loading && page && !endedAt && (
					<PageRenderer
						page={page}
						onAction={onAction}
						sessionId={sessionId}
						userState={userState}
						onUserStateChange={(updates) =>
							setUserState((prev) => ({ ...prev, ...updates }))
						}
					/>
				)}

				{!loading && endedAt && (
					<div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-8 text-center">
						{endRedirectUrl ? (
							<>
								<div className="text-lg font-medium">Thanks, that's it.</div>
								<div className="text-sm text-slate-500">
									{endRedirectUrl.toLowerCase().includes("prolific")
										? "Click below to complete on Prolific."
										: "Continue to the next step below."}
								</div>
								<div className="flex justify-center gap-3">
									<Button
										variant="ghost"
										onClick={() => {
											window.location.href = "/";
										}}
									>
										Back to samples
									</Button>
									<Button
										onClick={() => {
											if (!endRedirectUrl) return;
											window.location.assign(endRedirectUrl);
										}}
									>
										{endRedirectUrl.toLowerCase().includes("prolific")
											? "Continue to Prolific"
											: "Continue"}
									</Button>
								</div>
							</>
						) : (
							<>
								<div className="text-lg font-medium">Thanks, that's it.</div>
								<div className="text-sm text-slate-500">
									You can close this window.
								</div>
								<div className="flex justify-center">
									<Button
										variant="ghost"
										onClick={() => {
											window.location.href = "/";
										}}
									>
										Back to samples
									</Button>
								</div>
							</>
						)}
					</div>
				)}
			</main>
		</div>
	);
}
