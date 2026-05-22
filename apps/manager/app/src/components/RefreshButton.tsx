import { RefreshCw } from "lucide-react";

type Props = {
	onClick: () => void;
	refreshing: boolean;
	label?: string;
};

export function RefreshButton({
	onClick,
	refreshing,
	label = "Refresh",
}: Props) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={refreshing}
			className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 disabled:opacity-50"
		>
			<RefreshCw
				size={14}
				className={refreshing ? "animate-spin" : undefined}
			/>
			<span>{label}</span>
		</button>
	);
}
