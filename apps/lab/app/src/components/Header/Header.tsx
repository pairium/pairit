import { Login, Logout, useAuth } from "@components/Auth";

type HeaderProps = {
	sessionId: string | null;
};

export default function Header({ sessionId }: HeaderProps) {
	const { user, isLoading, isAuthenticated } = useAuth();

	const shortSessionId = sessionId?.slice(0, 8);
	const status = sessionId ? `Session: ${shortSessionId}…` : "—";

	return (
		<header className="border-b border-slate-200 bg-white/80 backdrop-blur">
			<div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
				<div className="text-lg font-semibold tracking-tight">Pairit Lab</div>
				<div className="flex items-center gap-4">
					<div className="text-sm text-slate-500">{status}</div>
					{!isLoading &&
						(isAuthenticated ? (
							<div className="flex items-center gap-3">
								<span className="text-sm text-slate-700">
									{user?.name || user?.email}
								</span>
								<Logout />
							</div>
						) : (
							<Login />
						))}
				</div>
			</div>
		</header>
	);
}
