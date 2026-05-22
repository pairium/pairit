import type { SessionStatus } from "@app/lib/api";

const STYLES: Record<SessionStatus | "active", string> = {
	completed: "bg-slate-100 text-slate-700",
	in_progress: "bg-emerald-50 text-emerald-700",
	active: "bg-emerald-50 text-emerald-700",
	abandoned: "bg-amber-50 text-amber-700",
};

const LABELS: Record<SessionStatus | "active", string> = {
	completed: "completed",
	in_progress: "in progress",
	active: "active",
	abandoned: "abandoned",
};

export function StatusPill({ status }: { status: SessionStatus | "active" }) {
	return (
		<span
			className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${STYLES[status]}`}
		>
			{LABELS[status]}
		</span>
	);
}
