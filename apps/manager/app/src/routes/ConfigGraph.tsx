import { api, type ConfigDetail as ConfigDetailType } from "@app/lib/api";
import { buildPageGraph } from "@app/lib/page-graph";
import { PageGraph } from "@components/PageGraph";
import { Link, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

export function ConfigGraph() {
	const { configId } = useParams({ from: "/configs/$configId/graph" });
	const [config, setConfig] = useState<ConfigDetailType | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		api
			.getConfig(configId)
			.then(setConfig)
			.catch((e: Error) => setError(e.message));
	}, [configId]);

	const graph = useMemo(
		() => (config ? buildPageGraph(config.config) : null),
		[config],
	);

	if (error) return <p className="text-sm text-red-600">{error}</p>;
	if (!config || !graph) {
		return <p className="text-sm text-slate-500">Loading…</p>;
	}

	return (
		<div className="space-y-6">
			<div>
				<div className="text-sm text-slate-500 mb-2">
					<Link to="/configs" className="hover:text-slate-900 no-underline">
						Experiments
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
					<span className="text-slate-900">Page graph</span>
				</div>
				<h1 className="text-2xl font-semibold tracking-tight text-slate-900">
					Page graph
				</h1>
				<p className="text-sm text-slate-600 mt-1">
					{graph.nodes.length} page{graph.nodes.length === 1 ? "" : "s"},{" "}
					{graph.edges.length} edge{graph.edges.length === 1 ? "" : "s"}.
					{graph.initialPageId && (
						<>
							{" "}
							Start: <code className="text-[12px]">{graph.initialPageId}</code>.
						</>
					)}
				</p>
			</div>
			<PageGraph graph={graph} />
		</div>
	);
}
