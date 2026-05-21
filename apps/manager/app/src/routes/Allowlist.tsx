import { type AllowlistUser, ApiError, api } from "@app/lib/api";
import { useSession } from "@app/lib/auth-client";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import { useEffect, useState } from "react";

function formatDate(s?: string): string {
	if (!s) return "—";
	return new Date(s).toLocaleString();
}

export function Allowlist() {
	const { data: session } = useSession();
	const [users, setUsers] = useState<AllowlistUser[] | null>(null);
	const [email, setEmail] = useState("");
	const [isAdmin, setIsAdmin] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [forbidden, setForbidden] = useState(false);
	const [adding, setAdding] = useState(false);

	const reload = async () => {
		try {
			setUsers(await api.listAllowlist());
			setForbidden(false);
		} catch (e) {
			if (e instanceof ApiError && e.status === 403) {
				setForbidden(true);
				setUsers(null);
			} else {
				setError(e instanceof Error ? e.message : "Failed to load");
			}
		}
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies: load once on mount
	useEffect(() => {
		reload();
	}, []);

	const handleAdd = async (e: React.FormEvent) => {
		e.preventDefault();
		setAdding(true);
		setError(null);
		try {
			await api.addAllowlistUser(email.trim(), isAdmin);
			setEmail("");
			setIsAdmin(false);
			await reload();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Add failed");
		} finally {
			setAdding(false);
		}
	};

	const handleRemove = async (target: string) => {
		if (!confirm(`Remove ${target} from the allowlist?`)) return;
		try {
			await api.removeAllowlistUser(target);
			await reload();
		} catch (e) {
			alert(e instanceof Error ? e.message : "Remove failed");
		}
	};

	if (forbidden) {
		return (
			<div className="space-y-4">
				<h1 className="text-2xl font-semibold tracking-tight text-slate-900">
					Allowlist
				</h1>
				<div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
					Admin access required.
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight text-slate-900">
					Allowlist
				</h1>
				<p className="text-sm text-slate-600 mt-1">
					Manage who can sign into the manager.
				</p>
			</div>

			<form
				onSubmit={handleAdd}
				className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4"
			>
				<div className="flex gap-2 items-start">
					<Input
						type="email"
						required
						placeholder="user@example.com"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						className="flex-1"
					/>
					<label className="flex items-center gap-2 text-sm text-slate-700 h-11 px-3">
						<input
							type="checkbox"
							checked={isAdmin}
							onChange={(e) => setIsAdmin(e.target.checked)}
						/>
						Admin
					</label>
					<Button type="submit" disabled={adding || !email.trim()}>
						{adding ? "Adding…" : "Add"}
					</Button>
				</div>
				{error && <p className="text-sm text-red-600">{error}</p>}
			</form>

			{!users && <p className="text-sm text-slate-500">Loading…</p>}
			{users && users.length === 0 && (
				<div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500">
					No entries yet.
				</div>
			)}
			{users && users.length > 0 && (
				<div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
					<table className="w-full text-sm">
						<thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider">
							<tr>
								<th className="text-left px-4 py-2.5 font-medium">Email</th>
								<th className="text-left px-4 py-2.5 font-medium">Role</th>
								<th className="text-left px-4 py-2.5 font-medium">Added</th>
								<th className="text-left px-4 py-2.5 font-medium">Added by</th>
								<th className="px-4 py-2.5" />
							</tr>
						</thead>
						<tbody>
							{users.map((u) => {
								const isSelf =
									session?.user?.email?.toLowerCase() === u.email.toLowerCase();
								return (
									<tr
										key={u.email}
										className="border-t border-slate-100 hover:bg-slate-50"
									>
										<td className="px-4 py-2.5 text-slate-900">{u.email}</td>
										<td className="px-4 py-2.5">
											{u.isAdmin ? (
												<span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-900 text-white">
													Admin
												</span>
											) : (
												<span className="text-slate-500 text-xs">
													Researcher
												</span>
											)}
										</td>
										<td className="px-4 py-2.5 text-slate-600">
											{formatDate(u.addedAt)}
										</td>
										<td className="px-4 py-2.5 text-slate-600">
											{u.addedBy ?? "—"}
										</td>
										<td className="px-4 py-2.5 text-right">
											<button
												type="button"
												onClick={() => handleRemove(u.email)}
												disabled={isSelf}
												className="text-xs text-slate-500 hover:text-red-600 disabled:text-slate-300 disabled:hover:text-slate-300"
												title={
													isSelf
														? "You can't remove yourself"
														: "Remove from allowlist"
												}
											>
												Remove
											</button>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}
