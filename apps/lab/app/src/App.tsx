import { Login } from "@components/Auth/Login";
import { Button } from "@components/ui/Button";
import { useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import Header from "./components/Header";
import { AuthRequiredError, advance, startSession } from "./lib/api";
import { useSession } from "./lib/auth-client";
import { loadConfig } from "./runtime";
import type { CompiledConfig } from "./runtime/config";
import { PageRenderer } from "./runtime/renderer";
import type { Page } from "./runtime/types";

export default function App() {
	const { experimentId } = useParams({ from: "/$experimentId" });
	const { data: session, isPending: authLoading } = useSession();
	const isAuthenticated = !!session?.user;
	const [mode, setMode] = useState<"local" | "remote" | null>(null);
	const [compiledConfig, setCompiledConfig] = useState<CompiledConfig | null>(
		null,
	);
	const [, setCurrentPageId] = useState<string | null>(null);
	const [sessionId, setSessionId] = useState<string | null>(null);
	const [page, setPage] = useState<Page | null>(null);
	const [endedAt, setEndedAt] = useState<string | null>(null);
	const [endRedirectUrl, setEndRedirectUrl] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [authRequired, setAuthRequired] = useState(false);

	useEffect(() => {
		let canceled = false;
		async function bootstrap() {
			// Wait for auth state to be determined before making API calls
			if (authLoading) return;

			// Check for view-only mode
			const searchParams = new URLSearchParams(window.location.search);
			const isViewMode =
				searchParams.get("view") === "true" ||
				searchParams.get("mode") === "view";

			if (!experimentId) {
				setError("Missing experiment ID");
				setMode(null);
				setCompiledConfig(null);
				setCurrentPageId(null);
				setSessionId(null);
				setPage(null);
				setEndedAt(null);
				setEndRedirectUrl(null);
				setAuthRequired(false);
				return;
			}
			setMode(null);
			setCompiledConfig(null);
			setCurrentPageId(null);
			setSessionId(null);
			setPage(null);
			setEndedAt(null);
			setEndRedirectUrl(null);
			setAuthRequired(false);
			setLoading(true);
			setError(null);

			// Try to load local config first
			let localConfig = null;
			try {
				localConfig = await loadConfig(experimentId);
				if (canceled) return;
			} catch (error) {
				console.error("Local config load failed", error);
				if (canceled) return;
			}

			// VIEW MODE: Frontend-only, no backend session
			if (isViewMode) {
				if (localConfig) {
					console.log("Loading in VIEW mode - no backend session");
					const initialPageId = localConfig.initialPageId;
					const initialPage = localConfig.pages[initialPageId] ?? null;
					setMode("local");
					setCompiledConfig(localConfig);
					setCurrentPageId(initialPageId);
					setSessionId(null); // No session ID
					setPage(initialPage);
					setEndRedirectUrl(initialPage?.endRedirectUrl ?? null);
					setEndedAt(initialPage?.end ? new Date().toISOString() : null);
				} else {
					setError(`Config not found: ${experimentId}`);
				}
				if (!canceled) setLoading(false);
				return;
			}

			// Try to create a remote session (works even with local config for event testing)
			try {
				const r = await startSession(experimentId);
				if (canceled) return;
				console.log(
					"Loading in REMOTE mode - sessionId:",
					r.sessionId,
					"- events will be submitted",
				);

				if (localConfig) {
					console.log("Using local config with remote session (hybrid mode)");
					console.log("Session currentPageId:", r.currentPageId);
					console.log(
						"Local config has page:",
						!!localConfig.pages[r.currentPageId],
					);
					console.log("Local page:", localConfig.pages[r.currentPageId]);

					setMode("remote");
					setCompiledConfig(localConfig); // Use local config but with remote session
					setCurrentPageId(r.currentPageId);
					setSessionId(r.sessionId);
					setPage(localConfig.pages[r.currentPageId]); // Use local page instead of remote page
					setEndRedirectUrl(
						localConfig.pages[r.currentPageId]?.endRedirectUrl ?? null,
					);
					setEndedAt(null);
				} else {
					setMode("remote");
					setCompiledConfig(null);
					setCurrentPageId(r.currentPageId);
					setSessionId(r.sessionId);
					setPage(r.page);
					setEndRedirectUrl(r.page?.endRedirectUrl ?? null);
					setEndedAt(null);
				}
			} catch (e: unknown) {
				if (canceled) return;
				console.error("Remote session start failed:", e);

				// Handle auth-required experiments
				if (e instanceof AuthRequiredError) {
					setAuthRequired(true);
					setLoading(false);
					return;
				}

				// Fall back to pure local mode if no backend available
				if (localConfig) {
					console.log(
						"Loading in LOCAL mode - no events will be submitted (backend unavailable)",
					);
					const initialPageId = localConfig.initialPageId;
					const initialPage = localConfig.pages[initialPageId] ?? null;
					setMode("local");
					setCompiledConfig(localConfig);
					setCurrentPageId(initialPageId);
					setSessionId(null);
					setPage(initialPage);
					setEndRedirectUrl(initialPage?.endRedirectUrl ?? null);
					setEndedAt(initialPage?.end ? new Date().toISOString() : null);
				} else {
					setError(e instanceof Error ? e.message : "Failed to start");
				}
			} finally {
				if (!canceled) setLoading(false);
			}
		}
		bootstrap();
		return () => {
			canceled = true;
		};
	}, [experimentId, authLoading]);

	async function onAction(a: { type: "go_to"; target: string }) {
		if (mode === "local" && compiledConfig) {
			const nextPage = compiledConfig.pages[a.target];
			if (!nextPage) {
				setError(`Unknown target: ${a.target}`);
				return;
			}
			setError(null);
			setCurrentPageId(a.target);
			setPage(nextPage);
			setEndRedirectUrl(nextPage.endRedirectUrl ?? null);
			setEndedAt(nextPage.end ? new Date().toISOString() : null);
			return;
		}

		if (!sessionId) return;

		// In hybrid mode, use local config for navigation but still update remote session
		if (mode === "remote" && compiledConfig) {
			const nextPage = compiledConfig.pages[a.target];
			if (!nextPage) {
				setError(`Unknown target: ${a.target}`);
				return;
			}
			setLoading(true);
			setError(null);
			try {
				// Update remote session state
				await advance(sessionId, a.target);
				// But use local page for rendering
				setCurrentPageId(a.target);
				setPage(nextPage);
				setEndRedirectUrl(nextPage.endRedirectUrl ?? null);
				setEndedAt(nextPage.end ? new Date().toISOString() : null);
			} catch (error: unknown) {
				setError(error instanceof Error ? error.message : "Failed to advance");
			} finally {
				setLoading(false);
			}
			return;
		}

		// Pure remote mode (no local config)
		setLoading(true);
		setError(null);
		try {
			const r = await advance(sessionId, a.target);
			setPage(r.page);
			setEndRedirectUrl(r.page?.endRedirectUrl ?? null);
			setEndedAt(r.endedAt);
		} catch (error: unknown) {
			setError(error instanceof Error ? error.message : "Failed to advance");
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="min-h-screen bg-slate-50 text-slate-900">
			<Header
				mode={mode}
				sessionId={sessionId}
				compiledConfig={compiledConfig}
				experimentId={experimentId}
			/>

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

				{!loading && page && !endedAt && (
					<PageRenderer page={page} onAction={onAction} sessionId={sessionId} />
				)}

				{!loading && endedAt && (
					<div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-8 text-center">
						{endRedirectUrl ? (
							<>
								<div className="text-lg font-medium">Thanks, that's it.</div>
								<div className="text-sm text-slate-500">
									Continue to the next step below.
								</div>
								<div className="flex justify-center">
									<Button
										onClick={() => {
											if (!endRedirectUrl) return;
											window.location.assign(endRedirectUrl);
										}}
									>
										Continue
									</Button>
								</div>
							</>
						) : (
							<>
								<div className="text-lg font-medium">Thanks, that's it.</div>
								<div className="text-sm text-slate-500">
									You can close this window.
								</div>
							</>
						)}
					</div>
				)}
			</main>
		</div>
	);
}
