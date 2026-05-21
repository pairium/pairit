import { api, type EventExport, type SessionExport } from "@app/lib/api";
import { PaginatedTable } from "@components/PaginatedTable";
import { Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";

function formatDate(s: string | null): string {
	if (!s) return "—";
	return new Date(s).toLocaleString();
}

function truncate(s: string, n: number): string {
	return s.length <= n ? s : `${s.slice(0, n)}…`;
}

export function SessionDetail() {
	const { configId, sessionId } = useParams({
		from: "/configs/$configId/sessions/$sessionId",
	});
	const [session, setSession] = useState<SessionExport | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		api
			.getSession(configId, sessionId)
			.then(setSession)
			.catch((e: Error) => setError(e.message));
	}, [configId, sessionId]);

	if (error) return <p className="text-sm text-red-600">{error}</p>;
	if (!session) return <p className="text-sm text-slate-500">Loading…</p>;

	const statusClass =
		session.status === "completed"
			? "bg-slate-100 text-slate-700"
			: "bg-emerald-50 text-emerald-700";

	return (
		<div className="space-y-8">
			<div>
				<div className="text-sm text-slate-500 mb-2">
					<Link to="/configs" className="hover:text-slate-900 no-underline">
						Configs
					</Link>
					<span className="mx-2 text-slate-300">/</span>
					<Link
						to="/configs/$configId"
						params={{ configId }}
						className="hover:text-slate-900 no-underline"
					>
						{configId}
					</Link>
					<span className="mx-2 text-slate-300">/</span>
					<Link
						to="/configs/$configId/$subpage"
						params={{ configId, subpage: "sessions" }}
						className="hover:text-slate-900 no-underline"
					>
						Sessions
					</Link>
					<span className="mx-2 text-slate-300">/</span>
					<span className="text-slate-900 font-mono text-[12px]">
						{truncate(session.sessionId, 14)}
					</span>
				</div>
				<div className="flex items-center gap-3">
					<h1 className="text-2xl font-semibold tracking-tight text-slate-900 font-mono">
						{truncate(session.sessionId, 24)}
					</h1>
					<span
						className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${statusClass}`}
					>
						{session.status.replace("_", " ")}
					</span>
				</div>
			</div>

			<section className="rounded-2xl border border-slate-200 bg-white p-6">
				<dl className="grid grid-cols-[10rem_1fr] gap-y-3 gap-x-6 text-sm">
					<dt className="text-slate-500">Session ID</dt>
					<dd className="text-slate-900 font-mono text-[12px] break-all">
						{session.sessionId}
					</dd>
					<dt className="text-slate-500">Current page</dt>
					<dd className="text-slate-900">{session.currentPageId || "—"}</dd>
					<dt className="text-slate-500">User</dt>
					<dd className="text-slate-900 font-mono text-[12px] break-all">
						{session.userId ?? "—"}
					</dd>
					<dt className="text-slate-500">Created</dt>
					<dd className="text-slate-900">{formatDate(session.createdAt)}</dd>
					<dt className="text-slate-500">Updated</dt>
					<dd className="text-slate-900">{formatDate(session.updatedAt)}</dd>
					<dt className="text-slate-500">Ended</dt>
					<dd className="text-slate-900">{session.endedAt ?? "—"}</dd>
				</dl>
			</section>

			{Object.keys(session.session_state).length > 0 && (
				<section className="space-y-3">
					<h2 className="text-base font-semibold text-slate-900">
						Session state
					</h2>
					<pre className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-[12px] font-mono text-slate-800 overflow-x-auto max-h-72">
						{JSON.stringify(session.session_state, null, 2)}
					</pre>
				</section>
			)}

			<section className="space-y-3">
				<h2 className="text-base font-semibold text-slate-900">
					Event timeline
				</h2>
				<PaginatedTable<EventExport>
					fetchPage={(cursor) =>
						api.listEvents(configId, cursor, undefined, sessionId)
					}
					rowKey={(r) => `${r.timestamp}-${r.componentId}-${r.type}`}
					emptyMessage="No events for this session yet."
					dependencies={[configId, sessionId]}
					columns={[
						{
							key: "timestamp",
							label: "Timestamp",
							render: (r) => formatDate(r.timestamp),
						},
						{ key: "type", label: "Type", render: (r) => r.type },
						{ key: "pageId", label: "Page", render: (r) => r.pageId },
						{
							key: "component",
							label: "Component",
							render: (r) => `${r.componentType}/${r.componentId}`,
						},
						{
							key: "data",
							label: "Data",
							render: (r) => (
								<span className="font-mono text-[11px] text-slate-700">
									{truncate(JSON.stringify(r.data), 80)}
								</span>
							),
						},
					]}
				/>
			</section>
		</div>
	);
}
