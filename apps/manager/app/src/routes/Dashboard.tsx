import { api, type ConfigSummary, type RecentSession } from "@app/lib/api";
import { StatusPill } from "@components/StatusPill";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

function formatDate(s: string | null): string {
	if (!s) return "—";
	return new Date(s).toLocaleString();
}

function truncate(s: string, n: number): string {
	return s.length <= n ? s : `${s.slice(0, n)}…`;
}

export function Dashboard() {
	const [configs, setConfigs] = useState<ConfigSummary[] | null>(null);
	const [recent, setRecent] = useState<RecentSession[] | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		api
			.listConfigs()
			.then(setConfigs)
			.catch((e: Error) => setError(e.message));
		api
			.listRecentSessions()
			.then(setRecent)
			.catch(() => setRecent([]));
	}, []);

	return (
		<div className="space-y-8">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight text-slate-900">
					Dashboard
				</h1>
				<p className="text-sm text-slate-600 mt-1">
					Your configs and recent activity.
				</p>
			</div>

			<section className="space-y-3">
				<div className="flex justify-between items-center">
					<h2 className="text-base font-semibold text-slate-900">
						Recent configs
					</h2>
					<Link
						to="/configs"
						className="text-sm text-slate-600 hover:text-slate-900"
					>
						View all →
					</Link>
				</div>
				{error && <p className="text-sm text-red-600">{error}</p>}
				{!configs && !error && (
					<p className="text-sm text-slate-500">Loading…</p>
				)}
				{configs && configs.length === 0 && (
					<div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500">
						No configs yet. Upload one with the CLI:{" "}
						<code>pairit config upload</code>.
					</div>
				)}
				{configs && configs.length > 0 && (
					<div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
						<table className="w-full text-sm">
							<thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider">
								<tr>
									<th className="text-left px-4 py-2.5 font-medium">
										Config ID
									</th>
									<th className="text-left px-4 py-2.5 font-medium">Updated</th>
								</tr>
							</thead>
							<tbody>
								{configs.slice(0, 5).map((c) => (
									<tr
										key={c.configId}
										className="border-t border-slate-100 hover:bg-slate-50"
									>
										<td className="px-4 py-2.5">
											<Link
												to="/configs/$configId"
												params={{ configId: c.configId }}
												className="text-slate-900 no-underline hover:underline"
											>
												{c.configId}
											</Link>
										</td>
										<td className="px-4 py-2.5 text-slate-600">
											{formatDate(c.updatedAt)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</section>

			<section className="space-y-3">
				<h2 className="text-base font-semibold text-slate-900">
					Recent sessions
				</h2>
				{!recent && <p className="text-sm text-slate-500">Loading…</p>}
				{recent && recent.length === 0 && (
					<div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500">
						No sessions yet.
					</div>
				)}
				{recent && recent.length > 0 && (
					<div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
						<table className="w-full text-sm">
							<thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider">
								<tr>
									<th className="text-left px-4 py-2.5 font-medium">Session</th>
									<th className="text-left px-4 py-2.5 font-medium">Config</th>
									<th className="text-left px-4 py-2.5 font-medium">Status</th>
									<th className="text-left px-4 py-2.5 font-medium">Page</th>
									<th className="text-left px-4 py-2.5 font-medium">Started</th>
								</tr>
							</thead>
							<tbody>
								{recent.map((s) => (
									<tr
										key={s.sessionId}
										className="border-t border-slate-100 hover:bg-slate-50"
									>
										<td className="px-4 py-2.5">
											<Link
												to="/configs/$configId/sessions/$sessionId"
												params={{
													configId: s.configId,
													sessionId: s.sessionId,
												}}
												className="font-mono text-[12px] text-slate-900 no-underline hover:underline"
											>
												{truncate(s.sessionId, 18)}
											</Link>
										</td>
										<td className="px-4 py-2.5">
											<Link
												to="/configs/$configId"
												params={{ configId: s.configId }}
												className="text-slate-700 no-underline hover:underline"
											>
												{s.configId}
											</Link>
										</td>
										<td className="px-4 py-2.5">
											<StatusPill status={s.status} />
										</td>
										<td className="px-4 py-2.5 text-slate-600">
											{s.currentPageId || "—"}
										</td>
										<td className="px-4 py-2.5 text-slate-600">
											{formatDate(s.createdAt)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</section>
		</div>
	);
}
