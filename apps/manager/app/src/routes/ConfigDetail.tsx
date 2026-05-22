import {
	ApiError,
	api,
	type ConfigCounts,
	type ConfigDetail as ConfigDetailType,
} from "@app/lib/api";
import { buildPageGraph } from "@app/lib/page-graph";
import { PageGraph } from "@components/PageGraph";
import { Button } from "@components/ui/Button";
import { YamlEditor, type YamlEditorHandle } from "@components/YamlEditor";
import { Link, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import YAML, { LineCounter } from "yaml";

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

function buildPageIdToLine(yamlText: string): Map<string, number> {
	const map = new Map<string, number>();
	if (!yamlText) return map;
	try {
		const lineCounter = new LineCounter();
		const doc = YAML.parseDocument(yamlText, { lineCounter });
		const pages = doc.get("pages", true);
		// Raw YAML stores pages as a seq; compiled configs stringified back to
		// YAML store them as a map keyed by id.
		if (YAML.isSeq(pages)) {
			for (const item of pages.items) {
				if (!YAML.isMap(item)) continue;
				const idNode = item.get("id", true);
				if (
					YAML.isScalar(idNode) &&
					typeof idNode.value === "string" &&
					idNode.range
				) {
					map.set(idNode.value, lineCounter.linePos(idNode.range[0]).line);
				}
			}
		} else if (YAML.isMap(pages)) {
			for (const pair of pages.items) {
				const key = pair.key;
				if (YAML.isScalar(key) && typeof key.value === "string" && key.range) {
					map.set(key.value, lineCounter.linePos(key.range[0]).line);
				}
			}
		}
	} catch {
		// invalid YAML during editing → no jump targets
	}
	return map;
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
	const yamlRef = useRef<YamlEditorHandle | null>(null);

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
	const displayedYaml = editing ? draft : yamlText;
	const pageIdToLine = useMemo(
		() => buildPageIdToLine(displayedYaml),
		[displayedYaml],
	);
	const graph = useMemo(
		() => (config ? buildPageGraph(config.config) : null),
		[config],
	);

	const handlePageClick = useCallback(
		(pageId: string) => {
			const line = pageIdToLine.get(pageId);
			if (line === undefined) return;
			yamlRef.current?.scrollToLine(line);
		},
		[pageIdToLine],
	);

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
		if (!confirm(`Delete experiment "${configId}"? This cannot be undone.`)) {
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
						Experiments
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

			{graph && graph.nodes.length > 0 && (
				<section className="space-y-3">
					<div className="flex justify-between items-end gap-3">
						<div>
							<h2 className="text-base font-semibold text-slate-900">Pages</h2>
							<p className="text-xs text-slate-500 mt-0.5">
								Click a node to jump to its YAML.
							</p>
						</div>
						<Link
							to="/configs/$configId/graph"
							params={{ configId: config.configId }}
							className="text-sm text-slate-600 hover:text-slate-900 no-underline"
						>
							Full view →
						</Link>
					</div>
					<PageGraph
						graph={graph}
						onPageClick={handlePageClick}
						height="420px"
					/>
				</section>
			)}

			<section className="space-y-3">
				<div className="flex justify-between items-center">
					<h2 className="text-base font-semibold text-slate-900">
						Experiment YAML
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
					ref={yamlRef}
					value={displayedYaml}
					onChange={editing ? setDraft : undefined}
					readOnly={!editing}
				/>
			</section>
		</div>
	);
}
