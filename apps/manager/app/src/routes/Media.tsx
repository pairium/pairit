import { api, type MediaObject } from "@app/lib/api";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import { useEffect, useState } from "react";

function formatBytes(n?: number): string {
	if (!n) return "—";
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
	return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function Media() {
	const [objects, setObjects] = useState<MediaObject[] | null>(null);
	const [prefix, setPrefix] = useState("");
	const [error, setError] = useState<string | null>(null);

	const reload = async (p: string) => {
		setError(null);
		try {
			setObjects(await api.listMedia(p || undefined));
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to load");
		}
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies: load once on mount
	useEffect(() => {
		reload("");
	}, []);

	const handleDelete = async (name: string) => {
		if (!confirm(`Delete "${name}"?`)) return;
		try {
			await api.deleteMedia(name);
			await reload(prefix);
		} catch (e) {
			alert(e instanceof Error ? e.message : "Delete failed");
		}
	};

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight text-slate-900">
					Media
				</h1>
				<p className="text-sm text-slate-600 mt-1">
					Files in the storage backend.
				</p>
			</div>

			<form
				className="flex gap-2"
				onSubmit={(e) => {
					e.preventDefault();
					reload(prefix);
				}}
			>
				<Input
					placeholder="Filter by prefix (optional)"
					value={prefix}
					onChange={(e) => setPrefix(e.target.value)}
					className="max-w-md"
				/>
				<Button type="submit" variant="ghost">
					Filter
				</Button>
			</form>

			{error && <p className="text-sm text-red-600">{error}</p>}
			{!objects && !error && <p className="text-sm text-slate-500">Loading…</p>}
			{objects && objects.length === 0 && (
				<div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500">
					No media files.
				</div>
			)}
			{objects && objects.length > 0 && (
				<div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
					<table className="w-full text-sm">
						<thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider">
							<tr>
								<th className="text-left px-4 py-2.5 font-medium">Object</th>
								<th className="text-left px-4 py-2.5 font-medium">Size</th>
								<th className="text-left px-4 py-2.5 font-medium">Type</th>
								<th className="px-4 py-2.5 font-medium" />
							</tr>
						</thead>
						<tbody>
							{objects.map((o) => (
								<tr
									key={o.name}
									className="border-t border-slate-100 hover:bg-slate-50"
								>
									<td className="px-4 py-2.5 font-mono text-[12px] text-slate-800 break-all">
										{o.publicUrl ? (
											<a
												href={o.publicUrl}
												target="_blank"
												rel="noopener"
												className="text-slate-900 no-underline hover:underline"
											>
												{o.name}
											</a>
										) : (
											o.name
										)}
									</td>
									<td className="px-4 py-2.5 text-slate-600">
										{formatBytes(o.size)}
									</td>
									<td className="px-4 py-2.5 text-slate-600">
										{o.contentType ?? "—"}
									</td>
									<td className="px-4 py-2.5 text-right">
										<button
											type="button"
											onClick={() => handleDelete(o.name)}
											className="text-xs text-slate-500 hover:text-red-600"
										>
											Delete
										</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}
