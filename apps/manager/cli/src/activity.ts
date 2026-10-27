/**
 * `pairit admin activity`: duration parsing and table output for the
 * manager's GET /admin/activity report.
 */

export type ConfigActivity = {
	configId: string;
	name: string | null;
	ownerId: string | null;
	ownerEmail: string | null;
	revision: number | null;
	updatedAt: string | null;
	lastActivityAt: string | null;
	activeNow: { total: number; inGroup: number; solo: number };
	waitingInMatchmaking: number;
	// Open sessions that started too long ago to count as active (newer servers)
	staleOpen?: number;
	startedToday: number;
	totalSessions: number;
	prolificSessions: number;
	isGroupStudy: boolean;
	features: {
		chat: boolean;
		liveWorkspace: boolean;
		html: boolean;
		agents: boolean;
	};
};

export type ActivityReport = {
	generatedAt: string;
	since: string;
	activeWindowMinutes: number;
	staleAfterHours?: number;
	configs: ConfigActivity[];
	liveGroupStudies: ConfigActivity[];
};

const UNIT_MS: Record<string, number> = {
	m: 60 * 1000,
	h: 60 * 60 * 1000,
	d: 24 * 60 * 60 * 1000,
	w: 7 * 24 * 60 * 60 * 1000,
};

/** "30m", "2h", "7d", "1w" -> milliseconds */
export function parseDuration(value: string): number {
	const match = /^(\d+)\s*([mhdw])$/.exec(value.trim());
	if (!match || Number(match[1]) <= 0) {
		throw new Error(
			`Invalid duration "${value}". Use a number and a unit: 30m, 2h, 7d, 1w.`,
		);
	}
	return Number(match[1]) * UNIT_MS[match[2]];
}

function isLive(entry: ConfigActivity): boolean {
	return entry.isGroupStudy && entry.activeNow.total > 0;
}

function owner(entry: ConfigActivity): string {
	return entry.ownerEmail ?? entry.ownerId ?? "-";
}

function flags(entry: ConfigActivity): string {
	const list: string[] = [];
	if (entry.isGroupStudy) list.push("group");
	if (entry.features.chat) list.push("chat");
	if (entry.features.liveWorkspace) list.push("live-workspace");
	if (entry.features.html) list.push("html");
	if (entry.features.agents) list.push("agents");
	return list.join(",") || "-";
}

/** One line per live group study, for the summary and the deploy check. */
export function describeLiveStudy(entry: ConfigActivity): string {
	const { total, inGroup, solo } = entry.activeNow;
	return `${entry.configId} (${owner(entry)}): ${total} active (${inGroup} in a group, ${solo} solo), ${entry.waitingInMatchmaking} waiting in matchmaking`;
}

export function formatActivity(
	report: ActivityReport,
	options: { color?: boolean } = {},
): string {
	const paint = (code: string, text: string) =>
		options.color ? `\x1b[${code}m${text}\x1b[0m` : text;
	const lines: string[] = [];

	const live = report.configs.filter(isLive);
	if (live.length > 0) {
		lines.push(
			paint(
				"1;31",
				`${live.length} group ${live.length === 1 ? "study is" : "studies are"} live. Don't deploy production.`,
			),
		);
		for (const entry of live) lines.push(`  ${describeLiveStudy(entry)}`);
	} else {
		lines.push("No group study is live.");
	}
	lines.push("");

	if (report.configs.length === 0) {
		lines.push(`No sessions since ${report.since}.`);
		return lines.join("\n");
	}

	// Live group studies first, whatever order the server sent
	const rows = [
		...live,
		...report.configs.filter((entry) => !isLive(entry)),
	].map((entry) => ({
		live: isLive(entry),
		cells: [
			entry.configId,
			owner(entry),
			`${entry.activeNow.total} (${entry.activeNow.inGroup}/${entry.activeNow.solo})`,
			String(entry.waitingInMatchmaking),
			String(entry.startedToday),
			String(entry.totalSessions),
			flags(entry),
		],
	}));
	const header = [
		"STUDY",
		"OWNER",
		"ACTIVE (GROUP/SOLO)",
		"WAITING",
		"TODAY",
		"TOTAL",
		"FLAGS",
	];
	const widths = header.map((title, i) =>
		Math.max(title.length, ...rows.map((row) => row.cells[i].length)),
	);
	const join = (cells: string[]) =>
		cells
			.map((cell, i) =>
				i === cells.length - 1 ? cell : cell.padEnd(widths[i]),
			)
			.join("  ");

	lines.push(`  ${join(header)}`);
	for (const row of rows) {
		const text = join(row.cells);
		lines.push(row.live ? paint("1;31", `● ${text}`) : `  ${text}`);
	}
	lines.push("");

	const stale = report.configs.filter((entry) => (entry.staleOpen ?? 0) > 0);
	if (stale.length > 0 && report.staleAfterHours) {
		lines.push(
			`Not counted: sessions that started over ${report.staleAfterHours} h ago but still change, usually a tab left open: ${stale.map((entry) => `${entry.configId} (${entry.staleOpen})`).join(", ")}.`,
		);
	}
	const started = report.staleAfterHours
		? `, changed in the last ${report.activeWindowMinutes} min, and started in the last ${report.staleAfterHours} h`
		: ` and changed in the last ${report.activeWindowMinutes} min`;
	lines.push(
		`Since ${report.since}. Active: not finished${started}. Today: started in the last 24 h.`,
	);
	return lines.join("\n");
}
