import type { Page } from "@app/lib/api";
import { Button } from "@components/ui/Button";
import { useCallback, useEffect, useRef, useState } from "react";

interface PaginatedTableProps<T> {
	fetchPage: (cursor?: string) => Promise<Page<T>>;
	columns: {
		key: string;
		label: string;
		render: (row: T) => React.ReactNode;
		mono?: boolean;
		className?: string;
	}[];
	rowKey: (row: T) => string;
	emptyMessage?: string;
	dependencies?: unknown[];
}

export function PaginatedTable<T>({
	fetchPage,
	columns,
	rowKey,
	emptyMessage = "Nothing here yet.",
	dependencies = [],
}: PaginatedTableProps<T>) {
	const [rows, setRows] = useState<T[]>([]);
	const [cursor, setCursor] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [loadingMore, setLoadingMore] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const ref = useRef({ fetchPage });
	ref.current.fetchPage = fetchPage;

	const reload = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const page = await ref.current.fetchPage(undefined);
			setRows(page.items);
			setCursor(page.nextCursor);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to load");
		} finally {
			setLoading(false);
		}
		// biome-ignore lint/correctness/useExhaustiveDependencies: dependencies array intentional
	}, dependencies);

	const loadMore = async () => {
		if (!cursor) return;
		setLoadingMore(true);
		try {
			const page = await ref.current.fetchPage(cursor);
			setRows((rs) => [...rs, ...page.items]);
			setCursor(page.nextCursor);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to load");
		} finally {
			setLoadingMore(false);
		}
	};

	useEffect(() => {
		reload();
	}, [reload]);

	if (loading) {
		return <p className="text-sm text-slate-500">Loading…</p>;
	}
	if (error) {
		return <p className="text-sm text-red-600">{error}</p>;
	}
	if (rows.length === 0) {
		return (
			<div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500">
				{emptyMessage}
			</div>
		);
	}

	return (
		<div className="space-y-3">
			<div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
				<div className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider">
							<tr>
								{columns.map((c) => (
									<th
										key={c.key}
										className="text-left px-4 py-2.5 font-medium whitespace-nowrap"
									>
										{c.label}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{rows.map((row) => (
								<tr
									key={rowKey(row)}
									className="border-t border-slate-100 hover:bg-slate-50"
								>
									{columns.map((c) => (
										<td
											key={c.key}
											className={`px-4 py-2.5 align-top ${
												c.mono
													? "font-mono text-[12px] text-slate-800"
													: "text-slate-800"
											} ${c.className ?? ""}`}
										>
											{c.render(row)}
										</td>
									))}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>
			{cursor && (
				<div className="flex justify-center">
					<Button variant="ghost" onClick={loadMore} disabled={loadingMore}>
						{loadingMore ? "Loading…" : "Load more"}
					</Button>
				</div>
			)}
		</div>
	);
}
