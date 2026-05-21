import type { Page } from "@app/lib/api";
import { Button } from "@components/ui/Button";
import { useState } from "react";

interface DownloadJsonButtonProps<T> {
	fetchPage: (cursor?: string) => Promise<Page<T>>;
	filename: string;
	label?: string;
}

function triggerDownload(filename: string, payload: unknown) {
	const blob = new Blob([JSON.stringify(payload, null, 2)], {
		type: "application/json",
	});
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

export function DownloadJsonButton<T>({
	fetchPage,
	filename,
	label = "Download JSON",
}: DownloadJsonButtonProps<T>) {
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const onClick = async () => {
		setBusy(true);
		setError(null);
		try {
			const all: T[] = [];
			let cursor: string | undefined;
			do {
				const page = await fetchPage(cursor);
				all.push(...page.items);
				cursor = page.nextCursor ?? undefined;
			} while (cursor);
			triggerDownload(filename, all);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Download failed");
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="flex items-center gap-3">
			<Button variant="ghost" onClick={onClick} disabled={busy}>
				{busy ? "Preparing…" : label}
			</Button>
			{error && <span className="text-sm text-red-600">{error}</span>}
		</div>
	);
}
