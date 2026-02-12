import type { CompiledConfig } from "@app/runtime/config";
import { Login, Logout, useAuth } from "@components/Auth";

type HeaderProps = {
	mode: "local" | "remote" | null;
	sessionId: string | null;
	compiledConfig: CompiledConfig | null;
	experimentId?: string;
};

export default function Header({
	mode,
	sessionId,
	compiledConfig,
	experimentId,
}: HeaderProps) {
	const { user, isLoading, isAuthenticated } = useAuth();

	const status =
		mode === "remote"
			? sessionId
				? compiledConfig
					? `Session: ${sessionId} (HYBRID - local config, remote events)`
					: `Session: ${sessionId} (REMOTE - events enabled)`
				: "No session"
			: mode === "local" && experimentId
				? `Config: ${experimentId} (LOCAL - no events)`
				: "—";

	return (
		<header className="border-b border-slate-200 bg-white/80 backdrop-blur">
			<div className="mx-auto flex w-full max-w-4xl items-center justify-between px-6 py-4">
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
