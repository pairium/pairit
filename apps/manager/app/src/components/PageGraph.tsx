import {
	Background,
	type Edge,
	Handle,
	type Node,
	type NodeProps,
	type NodeTypes,
	Position,
	ReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { PageGraph as PageGraphType, PageNode } from "@app/lib/page-graph";
import dagre from "dagre";
import { useCallback, useMemo } from "react";

const NODE_WIDTH = 220;
const NODE_HEIGHT = 96;

type PageNodeData = {
	page: PageNode;
	isInitial: boolean;
	clickable: boolean;
};

function PageGraphNode({ data }: NodeProps<Node<PageNodeData>>) {
	const { page, isInitial, clickable } = data;
	const ring = isInitial
		? "ring-2 ring-slate-900"
		: page.end
			? "ring-1 ring-slate-300"
			: "ring-1 ring-slate-200";
	const accent = page.end ? "bg-slate-50" : isInitial ? "bg-white" : "bg-white";
	const cursor = clickable ? "cursor-pointer hover:ring-slate-400" : "";

	return (
		<div
			className={`rounded-xl shadow-sm ${ring} ${accent} ${cursor} px-4 py-3 text-left transition-shadow`}
			style={{ width: NODE_WIDTH }}
		>
			<Handle type="target" position={Position.Top} className="!bg-slate-400" />
			<div className="flex items-center justify-between gap-2 mb-1">
				<span className="font-mono text-[12px] text-slate-900 truncate">
					{page.id}
				</span>
				{isInitial && (
					<span className="text-[10px] uppercase tracking-wider text-slate-500">
						start
					</span>
				)}
				{page.end && !isInitial && (
					<span className="text-[10px] uppercase tracking-wider text-slate-500">
						end
					</span>
				)}
			</div>
			<div className="text-[11px] text-slate-500 truncate">
				{page.componentTypes.length > 0 ? page.componentTypes.join(", ") : "—"}
			</div>
			<Handle
				type="source"
				position={Position.Bottom}
				className="!bg-slate-400"
			/>
		</div>
	);
}

const nodeTypes: NodeTypes = { page: PageGraphNode };

function layoutGraph(graph: PageGraphType, clickable: boolean) {
	const g = new dagre.graphlib.Graph();
	g.setGraph({ rankdir: "TB", ranksep: 60, nodesep: 30 });
	g.setDefaultEdgeLabel(() => ({}));

	for (const n of graph.nodes) {
		g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
	}
	for (const e of graph.edges) {
		g.setEdge(e.source, e.target);
	}
	dagre.layout(g);

	const nodes: Node<PageNodeData>[] = graph.nodes.map((page) => {
		const pos = g.node(page.id);
		return {
			id: page.id,
			type: "page",
			position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
			data: { page, isInitial: page.id === graph.initialPageId, clickable },
			draggable: false,
		};
	});

	const edges: Edge[] = graph.edges.map((e, i) => ({
		id: `${e.source}->${e.target}-${i}`,
		source: e.source,
		target: e.target,
		label: e.label,
		labelStyle: { fontSize: 10, fill: "#64748b" },
		labelBgStyle: { fill: "#f8fafc" },
		style: { stroke: "#94a3b8", strokeWidth: 1.5 },
		animated: false,
	}));

	return { nodes, edges };
}

type PageGraphProps = {
	graph: PageGraphType;
	onPageClick?: (pageId: string) => void;
	height?: string;
};

export function PageGraph({
	graph,
	onPageClick,
	height = "600px",
}: PageGraphProps) {
	const clickable = !!onPageClick;
	const { nodes, edges } = useMemo(
		() => layoutGraph(graph, clickable),
		[graph, clickable],
	);

	const handleNodeClick = useCallback(
		(_: unknown, node: Node<PageNodeData>) => {
			onPageClick?.(node.id);
		},
		[onPageClick],
	);

	if (nodes.length === 0) {
		return (
			<div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500">
				No pages in this experiment.
			</div>
		);
	}

	return (
		<div
			className="rounded-2xl border border-slate-200 bg-white overflow-hidden"
			style={{ height }}
		>
			<ReactFlow
				nodes={nodes}
				edges={edges}
				nodeTypes={nodeTypes}
				fitView
				fitViewOptions={{ padding: 0.2 }}
				proOptions={{ hideAttribution: true }}
				nodesDraggable={false}
				nodesConnectable={false}
				elementsSelectable={clickable}
				onNodeClick={clickable ? handleNodeClick : undefined}
			>
				<Background color="#e2e8f0" gap={20} />
			</ReactFlow>
		</div>
	);
}
