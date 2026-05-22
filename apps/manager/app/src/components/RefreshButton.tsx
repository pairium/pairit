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
			aria-label={label}
			title={label}
			className="text-slate-500 hover:text-slate-900 disabled:opacity-50 p-1 -m-1"
		>
			<RefreshCw
				size={16}
				className={refreshing ? "animate-spin" : undefined}
			/>
		</button>
	);
}
