import {
	api,
	type ChatMessageExport,
	type EventExport,
	type GroupExport,
	type SessionExport,
	type SurveyResponseExport,
	type WorkspaceDocumentExport,
} from "@app/lib/api";
import { PaginatedTable } from "@components/PaginatedTable";
import { Link, useParams } from "@tanstack/react-router";
import { useMemo } from "react";

const TITLES: Record<string, string> = {
	sessions: "Sessions",
	events: "Events",
	groups: "Groups",
	surveys: "Survey responses",
	chat: "Chat messages",
	workspaces: "Workspace documents",
};

function formatDate(s: string | null): string {
	if (!s) return "—";
	return new Date(s).toLocaleString();
}

function truncate(s: string, n: number): string {
	return s.length <= n ? s : `${s.slice(0, n)}…`;
}

function StatusPill({
	status,
}: {
	status: "completed" | "in_progress" | "active";
}) {
	const cls =
		status === "completed"
			? "bg-slate-100 text-slate-700"
			: status === "active" || status === "in_progress"
				? "bg-emerald-50 text-emerald-700"
				: "bg-slate-100 text-slate-700";
	return (
		<span
			className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${cls}`}
		>
			{status.replace("_", " ")}
		</span>
	);
}

export function ConfigData() {
	const { configId, subpage } = useParams({
		from: "/configs/$configId/$subpage",
	});

	const title = TITLES[subpage] ?? subpage;

	const table = useMemo(() => {
		switch (subpage) {
			case "sessions":
				return (
					<PaginatedTable<SessionExport>
						fetchPage={(cursor) => api.listSessions(configId, cursor)}
						rowKey={(r) => r.sessionId}
						emptyMessage="No sessions yet."
						dependencies={[configId]}
						columns={[
							{
								key: "sessionId",
								label: "Session ID",
								render: (r) => (
									<span className="font-mono text-[12px]">
										{truncate(r.sessionId, 18)}
									</span>
								),
							},
							{
								key: "status",
								label: "Status",
								render: (r) => <StatusPill status={r.status} />,
							},
							{
								key: "currentPageId",
								label: "Current page",
								render: (r) => r.currentPageId || "—",
							},
							{
								key: "createdAt",
								label: "Created",
								render: (r) => formatDate(r.createdAt),
							},
							{
								key: "updatedAt",
								label: "Updated",
								render: (r) => formatDate(r.updatedAt),
							},
						]}
					/>
				);
			case "events":
				return (
					<PaginatedTable<EventExport>
						fetchPage={(cursor) => api.listEvents(configId, cursor)}
						rowKey={(r) => `${r.sessionId}-${r.timestamp}-${r.componentId}`}
						emptyMessage="No events yet."
						dependencies={[configId]}
						columns={[
							{
								key: "timestamp",
								label: "Timestamp",
								render: (r) => formatDate(r.timestamp),
							},
							{ key: "type", label: "Type", render: (r) => r.type },
							{
								key: "sessionId",
								label: "Session",
								render: (r) => (
									<span className="font-mono text-[12px]">
										{truncate(r.sessionId, 14)}
									</span>
								),
							},
							{ key: "pageId", label: "Page", render: (r) => r.pageId },
							{
								key: "component",
								label: "Component",
								render: (r) => `${r.componentType}/${r.componentId}`,
							},
						]}
					/>
				);
			case "groups":
				return (
					<PaginatedTable<GroupExport>
						fetchPage={(cursor) => api.listGroups(configId, cursor)}
						rowKey={(r) => `${r.groupId}-${r.sessionId}`}
						emptyMessage="No groups yet."
						dependencies={[configId]}
						columns={[
							{
								key: "groupId",
								label: "Group ID",
								render: (r) => (
									<span className="font-mono text-[12px]">
										{truncate(r.groupId, 14)}
									</span>
								),
							},
							{
								key: "sessionId",
								label: "Session",
								render: (r) => (
									<span className="font-mono text-[12px]">
										{truncate(r.sessionId, 14)}
									</span>
								),
							},
							{ key: "poolId", label: "Pool", render: (r) => r.poolId },
							{
								key: "treatment",
								label: "Treatment",
								render: (r) => r.treatment,
							},
							{
								key: "status",
								label: "Status",
								render: (r) => <StatusPill status={r.status} />,
							},
							{
								key: "matchedAt",
								label: "Matched",
								render: (r) => formatDate(r.matchedAt),
							},
						]}
					/>
				);
			case "surveys":
				return (
					<PaginatedTable<SurveyResponseExport>
						fetchPage={(cursor) => api.listSurveyResponses(configId, cursor)}
						rowKey={(r) => `${r.sessionId}-${r.componentId}-${r.timestamp}`}
						emptyMessage="No survey responses yet."
						dependencies={[configId]}
						columns={[
							{
								key: "timestamp",
								label: "Timestamp",
								render: (r) => formatDate(r.timestamp),
							},
							{
								key: "sessionId",
								label: "Session",
								render: (r) => (
									<span className="font-mono text-[12px]">
										{truncate(r.sessionId, 14)}
									</span>
								),
							},
							{ key: "pageId", label: "Page", render: (r) => r.pageId },
							{
								key: "componentId",
								label: "Component",
								render: (r) => r.componentId,
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
				);
			case "chat":
				return (
					<PaginatedTable<ChatMessageExport>
						fetchPage={(cursor) => api.listChatMessages(configId, cursor)}
						rowKey={(r) => r.messageId ?? `${r.groupId}-${r.createdAt}`}
						emptyMessage="No chat messages yet."
						dependencies={[configId]}
						columns={[
							{
								key: "createdAt",
								label: "Sent",
								render: (r) => formatDate(r.createdAt),
							},
							{
								key: "groupId",
								label: "Group",
								render: (r) => (
									<span className="font-mono text-[12px]">
										{truncate(r.groupId, 12)}
									</span>
								),
							},
							{
								key: "senderType",
								label: "Sender",
								render: (r) => `${r.senderType}: ${truncate(r.senderId, 14)}`,
							},
							{
								key: "content",
								label: "Content",
								render: (r) => truncate(r.content, 120),
							},
						]}
					/>
				);
			case "workspaces":
				return (
					<PaginatedTable<WorkspaceDocumentExport>
						fetchPage={(cursor) => api.listWorkspaceDocuments(configId, cursor)}
						rowKey={(r) => `${r.groupId}-${r.updatedAt}`}
						emptyMessage="No workspace documents yet."
						dependencies={[configId]}
						columns={[
							{
								key: "updatedAt",
								label: "Updated",
								render: (r) => formatDate(r.updatedAt),
							},
							{
								key: "groupId",
								label: "Group",
								render: (r) => (
									<span className="font-mono text-[12px]">
										{truncate(r.groupId, 14)}
									</span>
								),
							},
							{ key: "mode", label: "Mode", render: (r) => r.mode },
							{
								key: "updatedBy",
								label: "Updated by",
								render: (r) => (
									<span className="font-mono text-[12px]">
										{truncate(r.updatedBy, 14)}
									</span>
								),
							},
							{
								key: "content",
								label: "Content",
								render: (r) =>
									r.content
										? truncate(r.content, 80)
										: r.fields
											? truncate(JSON.stringify(r.fields), 80)
											: "—",
							},
						]}
					/>
				);
			default:
				return (
					<p className="text-sm text-red-600">Unknown subpage: {subpage}</p>
				);
		}
	}, [configId, subpage]);

	return (
		<div className="space-y-6">
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
					<span className="text-slate-900">{title}</span>
				</div>
				<h1 className="text-2xl font-semibold tracking-tight text-slate-900">
					{title}
				</h1>
			</div>
			{table}
		</div>
	);
}
