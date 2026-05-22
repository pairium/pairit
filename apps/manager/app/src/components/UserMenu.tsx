import { signOut } from "@app/lib/auth-client";
import { useEffect, useRef, useState } from "react";

export function UserMenu({ email }: { email: string }) {
	const [open, setOpen] = useState(false);
	const wrapRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		if (!open) return;
		const onPointer = (e: MouseEvent) => {
			if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setOpen(false);
		};
		document.addEventListener("mousedown", onPointer);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("mousedown", onPointer);
			document.removeEventListener("keydown", onKey);
		};
	}, [open]);

	const handleSignOut = () => {
		signOut({
			fetchOptions: {
				onSuccess: () => {
					window.location.href = "/";
				},
			},
		});
	};

	return (
		<div ref={wrapRef} className="relative">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				aria-haspopup="menu"
				aria-expanded={open}
				className={`px-2.5 py-1 border rounded-full text-xs transition-colors ${
					open
						? "border-slate-300 bg-slate-50 text-slate-900"
						: "border-slate-200 bg-white text-slate-500 hover:text-slate-900 hover:border-slate-300"
				}`}
			>
				{email}
			</button>
			{open && (
				<div
					role="menu"
					className="absolute right-0 mt-2 w-56 origin-top-right rounded-xl border border-slate-200 bg-white shadow-lg py-1 z-40"
				>
					<div className="px-3 py-2 border-b border-slate-100">
						<div className="text-[11px] uppercase tracking-wider text-slate-500">
							Signed in as
						</div>
						<div className="text-sm text-slate-900 break-all">{email}</div>
					</div>
					<button
						type="button"
						role="menuitem"
						onClick={handleSignOut}
						className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-900"
					>
						Sign out
					</button>
				</div>
			)}
		</div>
	);
}
