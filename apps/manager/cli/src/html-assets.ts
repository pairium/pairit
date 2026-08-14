import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

export const HTML_MAX_BYTES = 1024 * 1024;

export type HtmlSourceInfo = {
	componentId: string;
	src: string;
	absolutePath: string;
	bytes: number;
};

type AnyRecord = Record<string, unknown>;

function isRecord(value: unknown): value is AnyRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function listHtmlComponents(config: { pages?: unknown }): Array<{
	id: string;
	props: AnyRecord;
}> {
	const pages = config.pages;
	const pageList: AnyRecord[] = Array.isArray(pages)
		? pages.filter(isRecord)
		: isRecord(pages)
			? Object.values(pages).filter(isRecord)
			: [];

	const result: Array<{ id: string; props: AnyRecord }> = [];
	for (const page of pageList) {
		const components = page.components;
		if (!Array.isArray(components)) continue;
		for (const comp of components) {
			if (!isRecord(comp) || comp.type !== "html") continue;
			const props = isRecord(comp.props) ? comp.props : {};
			const id = typeof comp.id === "string" ? comp.id : "html";
			result.push({ id, props });
		}
	}
	return result;
}

export async function resolveHtmlSource(
	src: unknown,
	componentId: string,
	configDir: string,
): Promise<{ src: string; absolutePath: string; bytes: number }> {
	if (typeof src !== "string" || src.trim() === "") {
		throw new Error(`html ${componentId}: missing src`);
	}
	const trimmed = src.trim();
	if (/^https?:\/\//i.test(trimmed)) {
		throw new Error(`html ${componentId}: remote URLs are not allowed`);
	}
	if (path.extname(trimmed).toLowerCase() !== ".html") {
		throw new Error(`html ${componentId}: src must be a .html file`);
	}

	const absolutePath = path.resolve(configDir, trimmed);
	const rel = path.relative(configDir, absolutePath);
	if (rel.startsWith("..") || path.isAbsolute(rel)) {
		throw new Error(
			`html ${componentId}: src must stay inside the config directory`,
		);
	}

	let info: Awaited<ReturnType<typeof stat>>;
	try {
		info = await stat(absolutePath);
	} catch {
		throw new Error(`html ${componentId}: file not found: ${trimmed}`);
	}
	if (!info.isFile()) {
		throw new Error(`html ${componentId}: file not found: ${trimmed}`);
	}
	if (info.size > HTML_MAX_BYTES) {
		throw new Error(
			`html ${componentId}: file too large (${formatBytes(info.size)}); max is 1 MB`,
		);
	}
	return { src: trimmed, absolutePath, bytes: info.size };
}

export async function resolveConfigDir(configPath: string): Promise<string> {
	const absolute = path.isAbsolute(configPath)
		? configPath
		: path.resolve(process.cwd(), configPath);
	return path.dirname(absolute);
}

export async function inspectHtmlSources(
	configPath: string,
	config: { pages?: unknown },
): Promise<HtmlSourceInfo[]> {
	const configDir = await resolveConfigDir(configPath);
	const errors: string[] = [];
	const results: HtmlSourceInfo[] = [];
	for (const comp of listHtmlComponents(config)) {
		try {
			const resolved = await resolveHtmlSource(
				comp.props.src,
				comp.id,
				configDir,
			);
			results.push({ componentId: comp.id, ...resolved });
		} catch (error) {
			errors.push(error instanceof Error ? error.message : String(error));
		}
	}
	if (errors.length) {
		throw new Error(errors.join("\n"));
	}
	return results;
}

export async function attachHtmlToCompiledConfig(
	configPath: string,
	compiled: { pages?: unknown },
): Promise<HtmlSourceInfo[]> {
	const configDir = await resolveConfigDir(configPath);
	const sources: HtmlSourceInfo[] = [];
	for (const comp of listHtmlComponents(compiled)) {
		const resolved = await resolveHtmlSource(
			comp.props.src,
			comp.id,
			configDir,
		);
		comp.props.html = await readFile(resolved.absolutePath, "utf8");
		sources.push({ componentId: comp.id, ...resolved });
	}
	return sources;
}
