import { useSession } from "@app/lib/auth-client";
import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";

const NAV = [
	{ to: "/", label: "Dashboard" },
	{ to: "/configs", label: "Configs" },
	{ to: "/media", label: "Media" },
];

const ADMIN_NAV = [{ to: "/admin/users", label: "Allowlist" }];

function BrandMark() {
	return (
		<svg
			className="h-4 w-4 stroke-current"
			strokeWidth={1.8}
			strokeLinecap="round"
			strokeLinejoin="round"
			fill="none"
			viewBox="0 0 24 24"
			aria-hidden="true"
		>
			<title>Pairit</title>
			<path d="M16 7h.01" />
			<path d="M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L2 20" />
			<path d="m20 7 2 .5-2 .5" />
			<path d="M10 18v3" />
			<path d="M14 17.75V21" />
			<path d="M7 18a6 6 0 0 0 3.84-10.61" />
		</svg>
	);
}

export function AppShell({ children }: { children: ReactNode }) {
	const { data: session } = useSession();
	const path = useRouterState({ select: (s) => s.location.pathname });

	const isActive = (to: string) =>
		to === "/" ? path === "/" : path === to || path.startsWith(`${to}/`);

	return (
		<div className="min-h-screen grid grid-rows-[auto_1fr_auto] bg-slate-50">
			<header className="flex items-center gap-4 px-6 py-3 border-b border-slate-200 bg-white/70 backdrop-blur">
				<Link
					to="/"
					className="inline-flex items-center gap-2 text-slate-900 no-underline font-semibold text-sm"
				>
					<BrandMark />
					<span>Pairit Manager</span>
				</Link>
				<nav className="flex items-center gap-1 ml-2">
					{NAV.map((item) => (
						<Link
							key={item.to}
							to={item.to}
							className={`text-sm px-3 py-1.5 rounded-md no-underline ${
								isActive(item.to)
									? "bg-slate-900 text-white"
									: "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
							}`}
						>
							{item.label}
						</Link>
					))}
					{ADMIN_NAV.map((item) => (
						<Link
							key={item.to}
							to={item.to}
							className={`text-sm px-3 py-1.5 rounded-md no-underline ${
								isActive(item.to)
									? "bg-slate-900 text-white"
									: "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
							}`}
						>
							{item.label}
						</Link>
					))}
				</nav>
				<div className="ml-auto text-xs text-slate-500">
					{session?.user?.email ? (
						<span className="px-2.5 py-1 border border-slate-200 bg-white rounded-full">
							{session.user.email}
						</span>
					) : (
						<span className="px-2.5 py-1 border border-slate-200 bg-white rounded-full">
							Invite-only
						</span>
					)}
				</div>
			</header>
			<main className="px-6 py-8 max-w-6xl w-full mx-auto">{children}</main>
			<footer className="flex items-center justify-between px-6 py-3 border-t border-slate-200 bg-white text-xs text-slate-500">
				<span>Pairit Manager</span>
				<span>&copy; Pairium AI</span>
			</footer>
		</div>
	);
}
