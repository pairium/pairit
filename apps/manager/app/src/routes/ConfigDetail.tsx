import {
	ApiError,
	api,
	type ConfigCounts,
	type ConfigDetail as ConfigDetailType,
} from "@app/lib/api";
import { Button } from "@components/ui/Button";
import { YamlEditor } from "@components/YamlEditor";
import { Link, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import YAML from "yaml";

function formatDate(s: string | null): string {
	if (!s) return "—";
	return new Date(s).toLocaleString();
}

const SUBPAGES: {
	slug: string;
	label: string;
	countKey: keyof ConfigCounts;
}[] = [
	{ slug: "sessions", label: "Sessions", countKey: "sessions" },
	{ slug: "events", label: "Events", countKey: "events" },
	{ slug: "groups", label: "Groups", countKey: "groups" },
	{ slug: "surveys", label: "Survey responses", countKey: "surveys" },
	{ slug: "chat", label: "Chat messages", countKey: "chatMessages" },
	{
		slug: "workspaces",
		label: "Workspace docs",
		countKey: "workspaceDocuments",
	},
];

function formatCount(n: number | undefined): string {
	if (n === undefined) return "";
	if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k`;
	return n.toString();
}

function deriveYaml(detail: ConfigDetailType): string {
	if (detail.rawYaml) return detail.rawYaml;
	try {
		return YAML.stringify(detail.config);
	} catch {
		return "";
	}
}

export function ConfigDetail() {
	const { configId } = useParams({ from: "/configs/$configId" });
	const [config, setConfig] = useState<ConfigDetailType | null>(null);
	const [counts, setCounts] = useState<ConfigCounts | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState("");
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);

	useEffect(() => {
		api
			.getConfig(configId)
			.then(setConfig)
			.catch((e: Error) => setError(e.message));
		api
			.getCounts(configId)
			.then(setCounts)
			.catch(() => setCounts(null));
	}, [configId]);

	const yamlText = useMemo(() => (config ? deriveYaml(config) : ""), [config]);

	const handleEdit = () => {
		setDraft(yamlText);
		setSaveError(null);
		setEditing(true);
	};

	const handleCancel = () => {
		setEditing(false);
		setSaveError(null);
	};

	const handleSave = async () => {
		setSaving(true);
		setSaveError(null);
		try {
			const updated = await api.uploadConfigYaml({ configId, yaml: draft });
			setConfig(updated);
			setEditing(false);
		} catch (e) {
			if (e instanceof ApiError) {
				setSaveError(e.message);
			} else {
				setSaveError(e instanceof Error ? e.message : "Save failed");
			}
		} finally {
			setSaving(false);
		}
	};

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
					{SUBPAGES.map((s) => {
						const count = counts?.[s.countKey];
						return (
							<Link
								key={s.slug}
								to="/configs/$configId/$subpage"
								params={{ configId: config.configId, subpage: s.slug }}
								className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 no-underline hover:bg-slate-50 hover:border-slate-300 transition-colors flex items-center justify-between gap-2"
							>
								<span>{s.label}</span>
								<span className="flex items-center gap-2 text-slate-500">
									{count !== undefined && (
										<span className="font-mono text-[12px]">
											{formatCount(count)}
										</span>
									)}
									<span className="text-slate-400">→</span>
								</span>
							</Link>
						);
					})}
				</div>
			</section>

			<section className="space-y-3">
				<div className="flex justify-between items-center">
					<h2 className="text-base font-semibold text-slate-900">
						Config YAML
					</h2>
					<div className="flex items-center gap-2">
						{editing ? (
							<>
								<Button
									type="button"
									variant="ghost"
									onClick={handleCancel}
									disabled={saving}
								>
									Cancel
								</Button>
								<Button type="button" onClick={handleSave} disabled={saving}>
									{saving ? "Saving…" : "Save"}
								</Button>
							</>
						) : (
							<Button type="button" variant="ghost" onClick={handleEdit}>
								Edit
							</Button>
						)}
					</div>
				</div>
				{saveError && (
					<p className="text-sm text-red-600 whitespace-pre-wrap">
						{saveError}
					</p>
				)}
				<YamlEditor
					value={editing ? draft : yamlText}
					onChange={editing ? setDraft : undefined}
					readOnly={!editing}
				/>
			</section>
		</div>
	);
}
