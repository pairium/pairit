import { api, type ConfigDetail as ConfigDetailType } from "@app/lib/api";
import { Button } from "@components/ui/Button";
import { Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";

function formatDate(s: string | null): string {
	if (!s) return "—";
	return new Date(s).toLocaleString();
}

const SUBPAGES = [
	{ slug: "sessions", label: "Sessions" },
	{ slug: "events", label: "Events" },
	{ slug: "groups", label: "Groups" },
	{ slug: "surveys", label: "Survey responses" },
	{ slug: "chat", label: "Chat messages" },
	{ slug: "workspaces", label: "Workspace docs" },
];

export function ConfigDetail() {
	const { configId } = useParams({ from: "/configs/$configId" });
	const [config, setConfig] = useState<ConfigDetailType | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		api
			.getConfig(configId)
			.then(setConfig)
			.catch((e: Error) => setError(e.message));
	}, [configId]);

	const handleDelete = async () => {
		if (!confirm(`Delete config "${configId}"? This cannot be undone.`)) {
			return;
		}
		try {
			await api.deleteConfig(configId);
			window.location.href = "/configs";
		} catch (e) {
			alert(e instanceof Error ? e.message : "Delete failed");
		}
	};

	if (error) return <p className="text-sm text-red-600">{error}</p>;
	if (!config) return <p className="text-sm text-slate-500">Loading…</p>;

	return (
		<div className="space-y-8">
			<div>
				<div className="text-sm text-slate-500 mb-2">
					<Link to="/configs" className="hover:text-slate-900 no-underline">
						Configs
					</Link>
					<span className="mx-2 text-slate-300">/</span>
					<span className="text-slate-900">{config.configId}</span>
				</div>
				<div className="flex items-start justify-between gap-4">
					<div>
						<h1 className="text-2xl font-semibold tracking-tight text-slate-900">
							{config.configId}
						</h1>
						<p className="text-sm text-slate-600 mt-1">
							Updated {formatDate(config.updatedAt)}
						</p>
					</div>
					<Button variant="ghost" onClick={handleDelete}>
						Delete
					</Button>
				</div>
			</div>

			<section className="rounded-2xl border border-slate-200 bg-white p-6">
				<dl className="grid grid-cols-[10rem_1fr] gap-y-3 gap-x-6 text-sm">
					<dt className="text-slate-500">Owner</dt>
					<dd className="text-slate-900 font-mono text-[12px] break-all">
						{config.owner ?? "—"}
					</dd>
					<dt className="text-slate-500">Checksum</dt>
					<dd className="text-slate-900 font-mono text-[12px] break-all">
						{config.checksum ?? "—"}
					</dd>
					<dt className="text-slate-500">Auth required</dt>
					<dd className="text-slate-900">
						{config.requireAuth ? "Yes" : "No"}
					</dd>
					<dt className="text-slate-500">Retakes allowed</dt>
					<dd className="text-slate-900">
						{config.allowRetake ? "Yes" : "No"}
					</dd>
					<dt className="text-slate-500">Created</dt>
					<dd className="text-slate-900">{formatDate(config.createdAt)}</dd>
				</dl>
			</section>

			<section className="space-y-3">
				<h2 className="text-base font-semibold text-slate-900">Structure</h2>
				<Link
					to="/configs/$configId/graph"
					params={{ configId: config.configId }}
					className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 no-underline hover:bg-slate-50 hover:border-slate-300 transition-colors flex items-center justify-between"
				>
					<span>Page graph</span>
					<span className="text-slate-400">→</span>
				</Link>
			</section>

			<section className="space-y-3">
				<h2 className="text-base font-semibold text-slate-900">Data</h2>
				<div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
					{SUBPAGES.map((s) => (
						<Link
							key={s.slug}
							to="/configs/$configId/$subpage"
							params={{ configId: config.configId, subpage: s.slug }}
							className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 no-underline hover:bg-slate-50 hover:border-slate-300 transition-colors flex items-center justify-between"
						>
							<span>{s.label}</span>
							<span className="text-slate-400">→</span>
						</Link>
					))}
				</div>
			</section>

			<section className="space-y-3">
				<h2 className="text-base font-semibold text-slate-900">Config JSON</h2>
				<pre className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-[12px] font-mono text-slate-800 overflow-x-auto max-h-96">
					{JSON.stringify(config.config, null, 2)}
				</pre>
			</section>
		</div>
	);
}
