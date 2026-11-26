#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Command, InvalidArgumentError, Option } from "commander";
import YAML from "yaml";
import {
	type ActivityReport,
	formatActivity,
	parseDuration,
} from "./activity.js";
import { auditData, filterSessions } from "./audit.js";
import { getAuthHeaders, login } from "./auth.js";
import { escapeCsvValue } from "./csv.js";
import { getApiUrl, getLabUrl, parseEnvName, setEnv } from "./env.js";
import { lintGroupView } from "./group-lint.js";
import {
	attachHtmlToCompiledConfig,
	attachWorkspaceFilesToCompiledConfig,
	formatBytes,
	type HtmlSourceInfo,
	inspectHtmlSources,
	inspectWorkspaceFiles,
} from "./html-assets.js";
import {
	type LlmKeyOptions,
	type LlmProvider,
	readAllStdin,
	resolveLlmKeys,
} from "./llm-keys.js";
import { lintRandomization } from "./randomize-lint.js";
import { lintEndRedirectUrls } from "./redirect-lint.js";
import { lintTimers } from "./timer-lint.js";

type ExperimentPage = {
	id: string;
	onEnter?: unknown[];
	components?: unknown[];
};

type ExperimentConfig = {
	schema_version?: string;
	name?: string;
	initialPageId?: string;
	pages?: ExperimentPage[];
	agents?: unknown[];
	matchmaking?: unknown;
	allowRetake?: boolean;
	requireAuth?: boolean;
};

const program = new Command();

program
	.name("pairit")
	.description("CLI for Pairit experiment configs")
	.version("0.3.12")
	.option(
		"--env <name>",
		"Target environment: staging or production",
		(value) => {
			try {
				return parseEnvName(value);
			} catch (error) {
				throw new InvalidArgumentError((error as Error).message);
			}
		},
	)
	.hook("preAction", (command) => {
		const name = command.optsWithGlobals().env;
		if (name) setEnv(name);
	});

program
	.command("login")
	.description("Login to Pairit Manager")
	.action(async () => {
		try {
			await login();
		} catch (error) {
			reportCliError("Login failed", error);
		}
	});

const configCommand = program
	.command("config")
	.description("Manage experiment configs");

configCommand
	.command("lint")
	.argument("<config>", "Path to YAML config")
	.description("Run minimal validation on a config file")
	.action(async (configPath: string) => {
		try {
			const htmlFiles = await lintConfig(configPath);
			console.log(`✓ ${configPath} passed lint checks`);
			for (const file of htmlFiles) {
				console.log(
					`  html ${file.componentId} ← ${file.src} (${formatBytes(file.bytes)})`,
				);
			}
		} catch (error) {
			if (error instanceof Error) {
				console.error(`Lint failed: ${error.message}`);
			} else {
				console.error("Lint failed with unknown error");
			}
			process.exitCode = 1;
		}
	});

configCommand
	.command("compile")
	.argument("<config>", "Path to YAML config")
	.description("Compile YAML config to canonical JSON next to source")
	.action(async (configPath: string) => {
		try {
			const outPath = await compileConfig(configPath);
			console.log(`✓ Wrote compiled JSON to ${outPath}`);
		} catch (error) {
			if (error instanceof Error) {
				console.error(`Compile failed: ${error.message}`);
			} else {
				console.error("Compile failed with unknown error");
			}
			process.exitCode = 1;
		}
	});

configCommand
	.command("upload")
	.argument("<config>", "Path to YAML config")
	.option(
		"--name <name>",
		"Config name (defaults to the YAML name field, then the file name)",
	)
	.option(
		"--config-id <configId>",
		"Update an existing config by id (configs created before names)",
	)
	.option("--metadata <json>", "Optional metadata JSON string")
	.option(
		"--openai-api-key <key>",
		"OpenAI API key for this experiment (visible in ps and shell history; prefer --openai-api-key-env)",
	)
	.option(
		"--openai-api-key-env <var>",
		"Read the OpenAI API key from this environment variable",
	)
	.option("--openai-api-key-stdin", "Read the OpenAI API key from stdin")
	.option("--clear-openai-api-key", "Remove the stored OpenAI API key")
	.option(
		"--anthropic-api-key <key>",
		"Anthropic API key for this experiment (visible in ps and shell history; prefer --anthropic-api-key-env)",
	)
	.option(
		"--anthropic-api-key-env <var>",
		"Read the Anthropic API key from this environment variable",
	)
	.option("--anthropic-api-key-stdin", "Read the Anthropic API key from stdin")
	.option("--clear-anthropic-api-key", "Remove the stored Anthropic API key")
	.description("Compile and upload config via Pairit Functions")
	.action(async (configPath: string, options: UploadOptions) => {
		try {
			const { payload, checksum, attachments } = await buildUploadPayload(
				configPath,
				options,
			);
			const response = await callFunctions("/configs/upload", {
				method: "POST",
				body: JSON.stringify(payload),
				headers: { "Content-Type": "application/json" },
			});

			for (const file of attachments) {
				console.log(
					`✓ Attached ${path.basename(file.src)} (${formatBytes(file.bytes)})`,
				);
			}
			const result = response as UploadResponse;
			const label = result.name
				? `${result.name} (${result.configId})`
				: result.configId;
			if (result.created) {
				console.log(`✓ Created ${label}, revision ${result.revision}`);
			} else if (result.previousRevision != null) {
				console.log(
					`✓ Uploaded ${label}, revision ${result.previousRevision} → ${result.revision}`,
				);
			} else {
				console.log(
					`✓ Uploaded ${label}, revision ${result.revision} (config unchanged)`,
				);
			}
			console.log(`  checksum ${checksum}`);
			for (const provider of payload.clearLlmCredentials ?? []) {
				if (result.llmCredentials?.[provider]) {
					console.warn(
						`⚠ The server kept the ${provider} key: it doesn't support clearing keys yet.`,
					);
				} else {
					console.log(`✓ Cleared the ${provider} key`);
				}
			}
			if (
				result.previousRevision != null &&
				result.previousRevisionSessionCount > 0
			) {
				const n = result.previousRevisionSessionCount;
				console.warn(
					`⚠ ${n} participant${n === 1 ? "" : "s"} ran revision ${result.previousRevision}. New participants will get revision ${result.revision}.`,
				);
				console.warn(
					"  Exports record each session's configRevision. For a different study, upload under a new --name instead.",
				);
			}
			const labUrl = getLabUrl();
			console.log(`Survey Link: ${labUrl}/${result.configId}`);
		} catch (error) {
			reportCliError("Upload failed", error);
		}
	});

configCommand
	.command("list")
	.description("List configs from Pairit Functions")
	.action(async (_options: ListOptions) => {
		try {
			const response = (await callFunctions(`/configs`, { method: "GET" })) as {
				configs?: unknown[];
			};

			const configs = (
				Array.isArray(response?.configs) ? response.configs : []
			) as ConfigListEntry[];
			if (!configs.length) {
				console.log("No configs found");
				return;
			}

			configs.forEach((config) => {
				const metadata = config.metadata as Record<string, unknown> | undefined;
				const filename = metadata?.originalFilename
					? ` | file=${metadata.originalFilename}`
					: "";
				const name = config.name ? `name=${config.name} | ` : "";
				const revision =
					config.revision != null ? ` | revision=${config.revision}` : "";
				console.log(
					`${name}configId=${config.configId}${revision} | owner=${config.owner} | checksum=${config.checksum}${filename} | updated=${config.updatedAt ?? "n/a"}`,
				);
			});
		} catch (error) {
			reportCliError("List failed", error);
		}
	});

configCommand
	.command("history")
	.argument("<configId>", "Config id")
	.option("--revision <n>", "Download one revision's compiled config")
	.option("--out <file>", "With --revision, write the config to this file")
	.description("List a config's revisions, or download one")
	.action(async (configId: string, options: HistoryOptions) => {
		try {
			const base = `/configs/${encodeURIComponent(configId)}/revisions`;
			if (options.revision) {
				const revision = (await callFunctions(
					`${base}/${encodeURIComponent(options.revision)}`,
					{ method: "GET" },
				)) as { config?: unknown };
				const json = JSON.stringify(revision.config, null, 2);
				if (options.out) {
					await writeFile(options.out, json, "utf8");
					console.log(`✓ Wrote revision ${options.revision} to ${options.out}`);
				} else {
					console.log(json);
				}
				return;
			}

			const history = (await callFunctions(base, { method: "GET" })) as {
				name: string | null;
				currentRevision: number | null;
				revisions: {
					revision: number;
					checksum: string | null;
					createdAt: string | null;
					sessionCount: number;
				}[];
			};
			if (!history.revisions.length) {
				console.log(
					"No revisions recorded yet. They start with the next upload.",
				);
				return;
			}
			for (const r of history.revisions) {
				const current =
					r.revision === history.currentRevision ? " (current)" : "";
				console.log(
					`revision=${r.revision}${current} | sessions=${r.sessionCount} | uploaded=${r.createdAt ?? "n/a"} | checksum=${r.checksum ?? "n/a"}`,
				);
			}
		} catch (error) {
			reportCliError("History failed", error);
		}
	});

configCommand
	.command("delete")
	.argument("<configId>", "Config id to delete")
	.option("--force", "Skip confirmation")
	.description("Delete config via Pairit Functions")
	.action(async (configId: string, options: DeleteOptions) => {
		try {
			if (!options.force) {
				const confirmed = await promptConfirm(
					`Delete config ${configId}? (y/N)`,
				);
				if (!confirmed) {
					console.log("Deletion aborted");
					return;
				}
			}

			await callFunctions(`/configs/${encodeURIComponent(configId)}`, {
				method: "DELETE",
			});
			console.log(`✓ Deleted ${configId}`);
		} catch (error) {
			reportCliError("Delete failed", error);
		}
	});

const mediaCommand = program
	.command("media")
	.description("Manage Cloud Storage media assets");

mediaCommand
	.command("upload")
	.argument("<file>", "Path to the media file to upload")
	.option(
		"--bucket <bucket>",
		"Destination Google Cloud Storage bucket (optional override)",
	)
	.option(
		"--object <object>",
		"Destination object path (defaults to derived hash)",
	)
	.option("--content-type <contentType>", "Content type to set on the object")
	.option("--metadata <json>", "Optional metadata JSON string")
	// Removed: the bucket is public-read, so "private" objects were not private.
	.addOption(new Option("--private").hideHelp())
	.description(
		"Upload a media asset. Anyone with its URL can read it; it is stored under your own folder.",
	)
	.action(async (filePath: string, options: MediaUploadOptions) => {
		try {
			if (options.private) {
				throw new Error(
					"--private is no longer supported. Anyone with a media object's URL can read it, so do not upload sensitive files.",
				);
			}
			const { object, checksum, response } = await uploadMedia(filePath, {
				bucket: options.bucket,
				object: options.object,
				metadata: options.metadata,
				contentType: options.contentType,
			});
			const stored =
				(response as { object?: string } | undefined)?.object ?? object;
			console.log(`✓ Uploaded media ${stored} (${checksum})`);
			if (typeof response !== "undefined") {
				console.log(JSON.stringify(response, null, 2));
			}
		} catch (error) {
			reportCliError("Media upload failed", error);
		}
	});

mediaCommand
	.command("list")
	.option("--bucket <bucket>", "Bucket to list from (optional override)")
	.option("--prefix <prefix>", "Prefix filter")
	.description("List media objects via Pairit Functions")
	.action(async (options: MediaListOptions) => {
		try {
			const params = new URLSearchParams();
			if (options.bucket) params.set("bucket", options.bucket);
			if (options.prefix) params.set("prefix", options.prefix);
			const response = (await callFunctions(`/media?${params.toString()}`, {
				method: "GET",
			})) as { objects?: unknown[] };

			const objects = (
				Array.isArray(response?.objects) ? response.objects : []
			) as MediaListEntry[];
			if (!objects.length) {
				console.log("No media objects found");
				return;
			}

			objects.forEach((object) => {
				console.log(
					`${object.name} | size=${object.size ?? "n/a"} | updated=${object.updatedAt ?? "n/a"}`,
				);
			});
		} catch (error) {
			reportCliError("Media list failed", error);
		}
	});

mediaCommand
	.command("delete")
	.argument(
		"<object>",
		"Object to delete: a name in your folder, or the full name from media list",
	)
	.option("--force", "Skip confirmation")
	.description("Delete a media object via Pairit Functions")
	.action(async (object: string, options: MediaDeleteOptions) => {
		try {
			if (!options.force) {
				const confirmed = await promptConfirm(`Delete media ${object}? (y/N)`);
				if (!confirmed) {
					console.log("Deletion aborted");
					return;
				}
			}

			await callFunctions(`/media/${encodeURIComponent(object)}`, {
				method: "DELETE",
			});
			console.log(`✓ Deleted media ${object}`);
		} catch (error) {
			reportCliError("Media delete failed", error);
		}
	});

const dataCommand = program
	.command("data")
	.description("Export experiment data");

dataCommand
	.command("export")
	.argument("<configId>", "Config ID to export data for")
	.option("--format <format>", "Output format: csv, json, jsonl", "csv")
	.option("--out <directory>", "Output directory", ".")
	.description("Export sessions, events, and chat messages for a config")
	.action(async (configId: string, options: DataExportOptions) => {
		try {
			await exportData(configId, options);
		} catch (error) {
			reportCliError("Export failed", error);
		}
	});

dataCommand
	.command("audit")
	.argument("<configId>", "Config ID to audit")
	.option(
		"--pid-prefix <prefix>",
		"Only sessions whose PROLIFIC_PID starts with this (e.g. bot_qa_)",
	)
	.option("--since <time>", "Only sessions created at or after this ISO time")
	.option(
		"--config <path>",
		"Config YAML, to check that required survey answers were saved",
	)
	.option(
		"--require-state <keys>",
		"Comma-separated session_state keys every finished session must have",
	)
	.description(
		"Check a test run: every session finished, required answers saved, groups complete",
	)
	.action(async (configId: string, options: DataAuditOptions) => {
		try {
			await auditCommand(configId, options);
		} catch (error) {
			reportCliError("Audit failed", error);
		}
	});

const adminCommand = program
	.command("admin")
	.description("Manage the manager allowlist and see activity (admin only)");

adminCommand
	.command("add-user")
	.argument("<email>", "Email to allow")
	.option("--admin", "Grant admin privileges")
	.description("Add a user to the manager allowlist")
	.action(async (email: string, options: AdminAddOptions) => {
		try {
			const response = (await callFunctions("/admin/users", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email, isAdmin: Boolean(options.admin) }),
			})) as { user?: AllowlistEntry };
			const entry = response?.user;
			if (!entry) throw new Error("No user returned");
			console.log(
				`✓ Added ${entry.email} (${entry.isAdmin ? "admin" : "researcher"})`,
			);
		} catch (error) {
			reportCliError("Add user failed", error);
		}
	});

adminCommand
	.command("remove-user")
	.argument("<email>", "Email to remove")
	.option("--force", "Skip confirmation")
	.description("Remove a user from the manager allowlist and revoke sessions")
	.action(async (email: string, options: AdminRemoveOptions) => {
		try {
			if (!options.force) {
				const confirmed = await promptConfirm(
					`Remove ${email} from allowlist? (y/N)`,
				);
				if (!confirmed) {
					console.log("Removal aborted");
					return;
				}
			}
			await callFunctions(`/admin/users/${encodeURIComponent(email)}`, {
				method: "DELETE",
			});
			console.log(`✓ Removed ${email}`);
		} catch (error) {
			reportCliError("Remove user failed", error);
		}
	});

adminCommand
	.command("list-users")
	.description("List users on the manager allowlist")
	.action(async () => {
		try {
			const response = (await callFunctions("/admin/users", {
				method: "GET",
			})) as { users?: AllowlistEntry[] };
			const users = response?.users ?? [];
			if (!users.length) {
				console.log("No users on the allowlist");
				return;
			}
			users.forEach((u) => {
				const role = u.isAdmin ? "admin" : "researcher";
				console.log(
					`${u.email} | ${role} | addedBy=${u.addedBy} | addedAt=${u.addedAt}`,
				);
			});
		} catch (error) {
			reportCliError("List users failed", error);
		}
	});

adminCommand
	.command("activity")
	.description(
		"Show studies with recent sessions, live group studies first (check before deploying production)",
	)
	.option(
		"--since <duration>",
		"How far back to look, e.g. 2h, 7d",
		(value) => {
			try {
				return parseDuration(value);
			} catch (error) {
				throw new InvalidArgumentError((error as Error).message);
			}
		},
	)
	.option("--json", "Print the raw report as JSON")
	.option(
		"--fail-if-live",
		"Exit with code 2 if any group study has active participants",
	)
	.action(async (options: AdminActivityOptions) => {
		try {
			const query = options.since
				? `?since=${encodeURIComponent(new Date(Date.now() - options.since).toISOString())}`
				: "";
			const report = (await callFunctions(`/admin/activity${query}`, {
				method: "GET",
			})) as ActivityReport;
			if (options.json) {
				console.log(JSON.stringify(report, null, 2));
			} else {
				console.log(
					formatActivity(report, {
						color: Boolean(process.stdout.isTTY) && !process.env.NO_COLOR,
					}),
				);
			}
			if (options.failIfLive && report.liveGroupStudies.length > 0) {
				process.exitCode = 2;
			}
		} catch (error) {
			reportCliError("Activity failed", error);
		}
	});

program.parseAsync(process.argv).catch((err) => {
	console.error(err);
	process.exit(1);
});

type UploadOptions = LlmKeyOptions & {
	name?: string;
	configId?: string;
	metadata?: string;
};

type ListOptions = Record<string, never>;

type HistoryOptions = {
	revision?: string;
	out?: string;
};

type UploadResponse = {
	configId: string;
	name: string | null;
	revision: number;
	created: boolean;
	previousRevision: number | null;
	previousRevisionSessionCount: number;
	llmCredentials?: Partial<Record<LlmProvider, boolean>>;
};

type DeleteOptions = {
	force?: boolean;
};

type AdminAddOptions = {
	admin?: boolean;
};

type AdminRemoveOptions = {
	force?: boolean;
};

type AdminActivityOptions = {
	since?: number;
	json?: boolean;
	failIfLive?: boolean;
};

type AllowlistEntry = {
	email: string;
	isAdmin: boolean;
	addedBy: string;
	addedAt: string;
};

type ConfigListEntry = {
	configId: string;
	name?: string | null;
	revision?: number | null;
	owner: string;
	checksum: string;
	updatedAt?: string | null;
	metadata?: unknown;
};

type MediaUploadOptions = {
	bucket?: string;
	object?: string;
	metadata?: string;
	contentType?: string;
	private?: boolean;
};

type MediaListOptions = {
	bucket?: string;
	prefix?: string;
};

type MediaDeleteOptions = {
	bucket?: string;
	force?: boolean;
};

type MediaListEntry = {
	name: string;
	size?: number;
	updatedAt?: string | null;
	metadata?: unknown;
};

type DataExportOptions = {
	format: "csv" | "json" | "jsonl";
	out: string;
};

type DataAuditOptions = {
	pidPrefix?: string;
	since?: string;
	config?: string;
	requireState?: string;
};

async function lintConfig(configPath: string): Promise<HtmlSourceInfo[]> {
	const config = await loadConfig(configPath);

	const errors: string[] = [];
	if (!config.schema_version) {
		errors.push("missing schema_version");
	}
	if (
		config.name !== undefined &&
		(typeof config.name !== "string" || !config.name.trim())
	) {
		errors.push("name must be a non-empty string");
	}
	if (!config.initialPageId) {
		errors.push("missing initialPageId");
	}
	if (!Array.isArray(config.pages) || config.pages.length === 0) {
		errors.push("pages must be a non-empty array");
	}
	if (Array.isArray(config.pages)) {
		config.pages.forEach((page, index) => {
			if (!page.id) {
				errors.push(`pages[${index}] is missing id`);
			}
			const width = (page as { width?: unknown } | null)?.width;
			if (width !== undefined && width !== "default" && width !== "wide") {
				errors.push(`pages[${index}].width must be "default" or "wide"`);
			}
			const pageHeight = (page as { height?: unknown } | null)?.height;
			if (
				pageHeight !== undefined &&
				(typeof pageHeight !== "number" ||
					!Number.isFinite(pageHeight) ||
					pageHeight <= 0)
			) {
				errors.push(`pages[${index}].height must be a positive number`);
			}
			page.components?.forEach((component, componentIndex) => {
				const comp = component as {
					type?: unknown;
					column?: unknown;
					props?: Record<string, unknown>;
				} | null;
				const column = comp?.column;
				if (column !== undefined && column !== "left" && column !== "right") {
					errors.push(
						`pages[${index}].components[${componentIndex}].column must be "left" or "right"`,
					);
				}
				if (comp?.type === "html" && comp.props) {
					const { height, borderless } = comp.props;
					if (
						height !== undefined &&
						height !== "auto" &&
						(typeof height !== "number" ||
							!Number.isFinite(height) ||
							height <= 0)
					) {
						errors.push(
							`pages[${index}].components[${componentIndex}].props.height must be "auto" or a positive number`,
						);
					}
					if (borderless !== undefined && typeof borderless !== "boolean") {
						errors.push(
							`pages[${index}].components[${componentIndex}].props.borderless must be a boolean`,
						);
					}
				}
			});
		});
	}
	errors.push(...lintRandomization(config));
	errors.push(...lintGroupView(config));
	errors.push(...lintEndRedirectUrls(config));
	errors.push(...lintTimers(config));

	if (errors.length) {
		throw new Error(errors.join(", "));
	}

	await inspectWorkspaceFiles(configPath, config);
	return inspectHtmlSources(configPath, config);
}

type MatchmakingPoolConfig = {
	id: string;
	num_users?: number;
	timeoutSeconds?: number;
	timeoutTarget?: string;
	assignment?: {
		type?: "random" | "balanced_random" | "block";
		conditions?: string[];
	};
};

type ComponentWithProps = {
	type: string;
	id?: string;
	props?: Record<string, unknown>;
};

async function compileConfig(configPath: string): Promise<string> {
	const config = await loadConfig(configPath);
	const redirectErrors = lintEndRedirectUrls(config);
	if (redirectErrors.length) {
		throw new Error(redirectErrors.join(", "));
	}

	// Build pool config lookup from matchmaking array
	const poolConfigs = new Map<string, MatchmakingPoolConfig>();
	if (Array.isArray(config.matchmaking)) {
		for (const pool of config.matchmaking as MatchmakingPoolConfig[]) {
			if (pool.id) {
				poolConfigs.set(pool.id, pool);
			}
		}
	}

	const pages: Record<string, Record<string, unknown>> = {};
	for (const page of config.pages ?? []) {
		const { id, ...rest } = page;

		// Process components: auto-generate IDs and merge pool configs
		if (Array.isArray(rest.components)) {
			rest.components = (rest.components as ComponentWithProps[]).map(
				(comp, index) => {
					// Auto-generate component ID if missing
					const withId = comp.id
						? comp
						: { ...comp, id: `${comp.type}-${index}` };

					if (withId.type === "matchmaking" && withId.props?.poolId) {
						const poolConfig = poolConfigs.get(withId.props.poolId as string);
						if (poolConfig) {
							return {
								...withId,
								props: {
									...withId.props,
									num_users: poolConfig.num_users,
									timeoutSeconds: poolConfig.timeoutSeconds,
									timeoutTarget: poolConfig.timeoutTarget,
									assignmentType: poolConfig.assignment?.type,
									conditions: poolConfig.assignment?.conditions,
								},
							};
						}
					}
					return withId;
				},
			);
		}

		pages[id] = { id, ...rest };
	}

	const pageIds = Object.keys(pages);
	const output: Record<string, unknown> = {
		schema_version: config.schema_version ?? "0.1.0",
		initialPageId: config.initialPageId ?? pageIds[0] ?? "intro",
		pages,
	};
	if (config.agents) {
		output.agents = config.agents;
	}
	if (config.matchmaking) {
		output.matchmaking = config.matchmaking;
	}

	const resolvedPath = await resolvePath(configPath);
	const outPath = path.join(
		path.dirname(resolvedPath),
		`${path.basename(resolvedPath, path.extname(resolvedPath))}.json`,
	);
	await writeFile(outPath, JSON.stringify(output, null, 2), "utf8");
	return outPath;
}

type UploadPayload = {
	name?: string;
	configId?: string;
	checksum: string;
	metadata?: Record<string, unknown> | null;
	config: unknown;
	llmCredentials?: {
		openaiApiKey?: string;
		anthropicApiKey?: string;
	};
	clearLlmCredentials?: LlmProvider[];
	allowRetake?: boolean;
	requireAuth?: boolean;
};

async function buildUploadPayload(
	configPath: string,
	options: UploadOptions,
): Promise<{
	payload: UploadPayload;
	checksum: string;
	attachments: HtmlSourceInfo[];
}> {
	// Load source YAML to read top-level flags (not preserved in compiled output)
	const sourceConfig = await loadConfig(configPath);
	const validationErrors = [
		...lintRandomization(sourceConfig),
		...lintTimers(sourceConfig),
	];
	if (validationErrors.length) {
		throw new Error(validationErrors.join(", "));
	}
	const allowRetake = sourceConfig.allowRetake === true;
	const requireAuth = sourceConfig.requireAuth;

	const compiledPath = await compileConfig(configPath);
	const compiledContent = await readFile(compiledPath, "utf8");
	const parsed = JSON.parse(compiledContent) as { pages?: unknown };
	const attachments = await attachHtmlToCompiledConfig(configPath, parsed);
	await attachWorkspaceFilesToCompiledConfig(configPath, parsed);
	const hashBuffer = createHash("sha256")
		.update(JSON.stringify(parsed))
		.digest();
	const checksum = hashBuffer.toString("hex");

	// New configs are created by name; --config-id only updates an existing
	// config, and then a name is sent only when set explicitly.
	const explicitName = options.name ?? sourceConfig.name;
	const name = options.configId
		? explicitName
		: (explicitName ?? path.basename(configPath, path.extname(configPath)));

	const metadata = options.metadata
		? (JSON.parse(options.metadata) as Record<string, unknown>)
		: {};

	// Auto-populate original filename if not manually provided
	if (!metadata.originalFilename) {
		metadata.originalFilename = path.basename(configPath);
	}

	const { llmCredentials, clearLlmCredentials } = await resolveLlmKeys(
		options,
		{ env: process.env, readStdin: readAllStdin },
	);

	return {
		payload: {
			...(name && { name }),
			...(options.configId && { configId: options.configId }),
			checksum,
			metadata: metadata ?? null,
			config: parsed,
			...(Object.keys(llmCredentials).length > 0 && { llmCredentials }),
			...(clearLlmCredentials.length > 0 && { clearLlmCredentials }),
			allowRetake,
			...(requireAuth !== undefined && { requireAuth }),
		},
		checksum,
		attachments,
	};
}

type MediaUploadPayload = {
	bucket?: string;
	object: string;
	checksum: string;
	data: string;
	contentType?: string | null;
	metadata?: Record<string, unknown> | null;
};

type SignedUploadResponse = {
	bucket: string;
	object: string;
	uploadUrl: string;
	method: string;
	headers?: Record<string, string> | null;
	expiresAt?: string | null;
	publicUrl?: string;
};

async function uploadMedia(
	filePath: string,
	options: MediaUploadOptions,
): Promise<{ object: string; checksum: string; response: unknown }> {
	const resolved = await resolvePath(filePath);
	const fileBuffer = await readFile(resolved);
	const hashBuffer = createHash("sha256").update(fileBuffer).digest();
	const checksum = hashBuffer.toString("hex");
	const defaultObject = `${toBase64Url(hashBuffer.subarray(0, 12))}${path.extname(resolved)}`;
	const object = options.object ?? defaultObject;
	const maxInlineBytes = getInlineMediaLimit();

	let metadata: Record<string, unknown> | undefined;
	if (options.metadata) {
		try {
			metadata = JSON.parse(options.metadata) as Record<string, unknown>;
		} catch (error) {
			throw new Error(
				`Invalid metadata JSON: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	if (fileBuffer.length > maxInlineBytes) {
		const signedResponse = await requestSignedUpload({
			bucket: options.bucket,
			object,
			contentType: options.contentType,
		});
		await uploadViaSignedUrl(fileBuffer, signedResponse);
		return { object, checksum, response: signedResponse };
	}

	const payload: MediaUploadPayload = {
		bucket: options.bucket,
		object,
		checksum,
		data: fileBuffer.toString("base64"),
		contentType: options.contentType ?? null,
		metadata: metadata ?? null,
	};

	const response = await callFunctions("/media/upload", {
		method: "POST",
		body: JSON.stringify(payload),
		headers: { "Content-Type": "application/json" },
	});

	return { object, checksum, response };
}

async function requestSignedUpload(input: {
	bucket?: string;
	object: string;
	contentType?: string;
}): Promise<SignedUploadResponse> {
	const response = await callFunctions("/media/upload-url", {
		method: "POST",
		body: JSON.stringify({
			bucket: input.bucket,
			object: input.object,
			contentType: input.contentType ?? null,
		}),
		headers: { "Content-Type": "application/json" },
	});

	return response as SignedUploadResponse;
}

async function uploadViaSignedUrl(
	fileBuffer: Buffer,
	signed: SignedUploadResponse,
): Promise<void> {
	const headers = signed.headers ?? undefined;
	const body = new Uint8Array(fileBuffer);
	const res = await fetch(signed.uploadUrl, {
		method: signed.method || "PUT",
		headers: headers ?? undefined,
		body,
	});
	if (!res.ok) {
		const text = await res.text().catch(() => "");
		throw new Error(`Signed upload failed: HTTP ${res.status} ${text}`);
	}
}

function toBase64Url(buffer: Buffer): string {
	return buffer
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "");
}

async function loadConfig(configPath: string): Promise<ExperimentConfig> {
	const resolvedPath = await resolvePath(configPath);
	const content = await readFile(resolvedPath, "utf8");
	const parsed = YAML.parse(content);
	if (!parsed || typeof parsed !== "object") {
		throw new Error("config must be an object");
	}
	return parsed as ExperimentConfig;
}

async function resolvePath(configPath: string): Promise<string> {
	const cwd = process.cwd();
	const absolute = path.isAbsolute(configPath)
		? configPath
		: path.resolve(cwd, configPath);

	await stat(absolute);
	return absolute;
}

async function fetchAllPages<T>(
	pathname: string,
	extract: (response: unknown) => T[],
): Promise<T[]> {
	const all: T[] = [];
	let since: string | null = null;
	do {
		const url = since
			? `${pathname}?since=${encodeURIComponent(since)}`
			: pathname;
		const response = (await callFunctions(url, { method: "GET" })) as
			| { nextCursor?: string | null }
			| undefined;
		if (!response) break;
		all.push(...extract(response));
		since = response.nextCursor ?? null;
	} while (since);
	return all;
}

async function callFunctions(
	pathname: string,
	init: RequestInit = {},
): Promise<unknown> {
	const baseUrl = getApiUrl();
	const url = new URL(pathname, baseUrl).toString();

	// Inject auth headers
	const authHeaders = await getAuthHeaders();
	const headers = {
		...init.headers,
		...authHeaders,
		Origin: new URL(baseUrl).origin, // Satisfy Better Auth CSRF/Origin check
	};

	// console.log('[Debug] Fetching:', url);
	// console.log('[Debug] Headers:', JSON.stringify(headers, null, 2));

	const response = await fetch(url, { ...init, headers });

	const text = await response.text();
	if (!response.ok) {
		throw new Error(`HTTP ${response.status}: ${text}`);
	}

	if (!text) return undefined;
	try {
		return JSON.parse(text);
	} catch (_error) {
		throw new Error(`Invalid JSON response: ${text}`);
	}
}

function getInlineMediaLimit(): number {
	const fromEnv = Number(process.env.PAIRIT_MAX_INLINE_MEDIA_BYTES);
	if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
	return 5 * 1024 * 1024;
}

async function promptConfirm(prompt: string): Promise<boolean> {
	process.stdout.write(`${prompt} `);
	return new Promise((resolve) => {
		process.stdin.setEncoding("utf8");
		process.stdin.resume();
		process.stdin.once("data", (data) => {
			const input = data.toString().trim().toLowerCase();
			resolve(input === "y" || input === "yes");
			process.stdin.pause();
		});
	});
}

function reportCliError(prefix: string, error: unknown) {
	if (error instanceof Error) {
		console.error(`${prefix}: ${error.message}`);
	} else {
		console.error(`${prefix}: unknown error`);
	}
	process.exitCode = 1;
}

async function exportData(
	configId: string,
	options: DataExportOptions,
): Promise<void> {
	const format = options.format;
	const outDir = path.resolve(process.cwd(), options.out);

	// Ensure output directory exists
	await mkdir(outDir, { recursive: true });

	console.log(`Exporting data for ${configId} in ${format} format...`);

	const cfg = encodeURIComponent(configId);

	await fetchAndWriteExport<SessionExport>(
		`/data/${cfg}/sessions`,
		path.join(outDir, `${configId}-sessions`),
		(r) => (r as { sessions?: SessionExport[] }).sessions ?? [],
		format,
		flattenSession,
		"sessions",
	);

	await fetchAndWriteExport<EventExport>(
		`/data/${cfg}/events`,
		path.join(outDir, `${configId}-events`),
		(r) => (r as { events?: EventExport[] }).events ?? [],
		format,
		flattenEvent,
		"events",
	);

	await fetchAndWriteExport<ChatMessageExport>(
		`/data/${cfg}/chat-messages`,
		path.join(outDir, `${configId}-chat-messages`),
		(r) => (r as { messages?: ChatMessageExport[] }).messages ?? [],
		format,
		(msg) => msg as unknown as Record<string, unknown>,
		"chat messages",
	);

	await fetchAndWriteExport<GroupExport>(
		`/data/${cfg}/groups`,
		path.join(outDir, `${configId}-groups`),
		(r) => (r as { groups?: GroupExport[] }).groups ?? [],
		format,
		(group) => group as unknown as Record<string, unknown>,
		"groups",
	);

	await fetchAndWriteExport<SurveyResponseExport>(
		`/data/${cfg}/survey-responses`,
		path.join(outDir, `${configId}-survey-responses`),
		(r) =>
			(r as { surveyResponses?: SurveyResponseExport[] }).surveyResponses ?? [],
		format,
		flattenSurveyResponse,
		"survey responses",
	);

	await fetchAndWriteExport<WorkspaceDocumentExport>(
		`/data/${cfg}/workspace-documents`,
		path.join(outDir, `${configId}-workspace-documents`),
		(r) =>
			(r as { workspaceDocuments?: WorkspaceDocumentExport[] })
				.workspaceDocuments ?? [],
		format,
		flattenWorkspaceDocument,
		"workspace documents",
	);

	await fetchAndWriteExport<WorkspaceUpdateExport>(
		`/data/${cfg}/workspace-updates`,
		path.join(outDir, `${configId}-workspace-updates`),
		(r) =>
			(r as { workspaceUpdates?: WorkspaceUpdateExport[] }).workspaceUpdates ??
			[],
		format,
		(update) => update as unknown as Record<string, unknown>,
		"workspace updates",
	);

	console.log(`\nFiles written to: ${outDir}`);
}

async function auditCommand(
	configId: string,
	options: DataAuditOptions,
): Promise<void> {
	if (options.since && Number.isNaN(Date.parse(options.since))) {
		throw new Error(`--since is not a valid time: ${options.since}`);
	}
	const config = options.config ? await loadConfig(options.config) : undefined;
	const cfg = encodeURIComponent(configId);

	const allSessions = await fetchAllPages<SessionExport>(
		`/data/${cfg}/sessions`,
		(r) => (r as { sessions?: SessionExport[] }).sessions ?? [],
	);
	const sessions = filterSessions(allSessions, {
		pidPrefix: options.pidPrefix,
		since: options.since,
	});
	if (sessions.length === 0) {
		throw new Error("no sessions match; check --pid-prefix and --since");
	}
	const groups = await fetchAllPages<GroupExport>(
		`/data/${cfg}/groups`,
		(r) => (r as { groups?: GroupExport[] }).groups ?? [],
	);
	const surveyResponses = await fetchAllPages<SurveyResponseExport>(
		`/data/${cfg}/survey-responses`,
		(r) =>
			(r as { surveyResponses?: SurveyResponseExport[] }).surveyResponses ?? [],
	);

	const result = auditData({
		sessions,
		groups,
		surveyResponses,
		config,
		requireState: options.requireState
			?.split(",")
			.map((key) => key.trim())
			.filter(Boolean),
	});

	console.log(
		`Audited ${result.sessions} sessions: ${result.completed} finished.`,
	);
	for (const warning of result.warnings) console.log(`⚠ ${warning}`);
	for (const error of result.errors) console.log(`✗ ${error}`);
	if (result.errors.length > 0) {
		console.log(`\n${result.errors.length} problem(s) found.`);
		process.exitCode = 1;
	} else {
		console.log("✓ No problems found.");
	}
}

async function fetchAndWriteExport<T>(
	pathname: string,
	outBase: string,
	extract: (response: unknown) => T[],
	format: "csv" | "json" | "jsonl",
	flatten: (item: T) => Record<string, unknown>,
	label: string,
): Promise<void> {
	const data = await fetchAllPages<T>(pathname, extract);
	await writeExportFile(outBase, data, format, flatten);
	console.log(`✓ Exported ${data.length} ${label}`);
}

type SessionExport = {
	sessionId: string;
	configId: string;
	currentPageId: string;
	status: string;
	session_state: Record<string, unknown>;
	prolific: { prolificPid: string; studyId: string; sessionId: string } | null;
	userId: string | null;
	configRevision: number | null;
	configChecksum: string | null;
	labVersion: string | null;
	labRevision: string | null;
	createdAt: string | null;
	updatedAt: string | null;
	endedAt: string | null;
};

type EventExport = {
	sessionId: string;
	type: string;
	pageId: string;
	componentType: string;
	componentId: string;
	data: Record<string, unknown>;
	timestamp: string;
	createdAt: string | null;
};

type ChatMessageExport = {
	messageId: string | null;
	groupId: string;
	senderId: string;
	senderType: string;
	content: string;
	createdAt: string | null;
};

type GroupExport = {
	groupId: string;
	sessionId: string;
	poolId: string;
	treatment: string;
	matchedAt: string | null;
	status: string;
};

type SurveyResponseExport = {
	sessionId: string;
	pageId: string;
	componentId: string;
	timestamp: string;
	data: Record<string, unknown>;
};

type WorkspaceDocumentExport = {
	groupId: string;
	mode: string;
	content: string | null;
	fields: Record<string, unknown> | null;
	// Freeform: the final text split by who inserted it
	authorship: Array<{ origin: string; text: string }> | null;
	// Structured: who last set each field
	fieldAuthors: Record<string, string> | null;
	updateCount: number;
	updatedBy: string;
	createdAt: string | null;
	updatedAt: string | null;
};

type WorkspaceUpdateExport = {
	groupId: string;
	origin: string;
	createdAt: string;
	// Base64 Yjs update; replaying a group's updates rebuilds its doc
	update: string;
};

function flattenSession(session: SessionExport): Record<string, unknown> {
	const { session_state, prolific, ...rest } = session;

	const flattened: Record<string, unknown> = { ...rest };

	// Flatten session_state with prefix
	if (session_state && typeof session_state === "object") {
		for (const [key, value] of Object.entries(session_state)) {
			flattened[`session_state.${key}`] = serializeValue(value);
		}
	}

	// Flatten prolific with prefix
	if (prolific) {
		flattened["prolific.prolificPid"] = prolific.prolificPid;
		flattened["prolific.studyId"] = prolific.studyId;
		flattened["prolific.sessionId"] = prolific.sessionId;
	}

	return flattened;
}

function flattenEvent(event: EventExport): Record<string, unknown> {
	const { data, ...rest } = event;

	const flattened: Record<string, unknown> = { ...rest };

	// Flatten data with prefix
	if (data && typeof data === "object") {
		for (const [key, value] of Object.entries(data)) {
			flattened[`data.${key}`] = serializeValue(value);
		}
	}

	return flattened;
}

function deepFlatten(
	obj: Record<string, unknown>,
	prefix: string,
): Record<string, string | number | boolean | null> {
	const result: Record<string, string | number | boolean | null> = {};
	for (const [key, value] of Object.entries(obj)) {
		const fullKey = `${prefix}.${key}`;
		if (value !== null && typeof value === "object" && !Array.isArray(value)) {
			Object.assign(
				result,
				deepFlatten(value as Record<string, unknown>, fullKey),
			);
		} else {
			result[fullKey] = serializeValue(value);
		}
	}
	return result;
}

function flattenSurveyResponse(
	response: SurveyResponseExport,
): Record<string, unknown> {
	const { data, ...rest } = response;
	const flattened: Record<string, unknown> = { ...rest };

	if (data && typeof data === "object") {
		Object.assign(flattened, deepFlatten(data, "data"));
	}

	return flattened;
}

function flattenWorkspaceDocument(
	doc: WorkspaceDocumentExport,
): Record<string, unknown> {
	const { fields, authorship, fieldAuthors, ...rest } = doc;
	const flattened: Record<string, unknown> = {
		...rest,
		authorship: serializeValue(authorship),
	};

	if (fields && typeof fields === "object") {
		for (const [key, value] of Object.entries(fields)) {
			flattened[`fields.${key}`] = serializeValue(value);
		}
	}
	if (fieldAuthors && typeof fieldAuthors === "object") {
		for (const [key, origin] of Object.entries(fieldAuthors)) {
			flattened[`fieldAuthors.${key}`] = origin;
		}
	}

	return flattened;
}

function serializeValue(value: unknown): string | number | boolean | null {
	if (value === null || value === undefined) return null;
	if (typeof value === "string") return value;
	if (typeof value === "number") return value;
	if (typeof value === "boolean") return value;
	return JSON.stringify(value);
}

async function writeExportFile<T>(
	basePath: string,
	data: T[],
	format: "csv" | "json" | "jsonl",
	flatten: (item: T) => Record<string, unknown>,
): Promise<void> {
	const filePath = `${basePath}.${format}`;

	if (format === "json") {
		await writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
		return;
	}

	if (format === "jsonl") {
		const lines = data.map((item) => JSON.stringify(item));
		await writeFile(filePath, lines.join("\n"), "utf8");
		return;
	}

	// CSV format
	if (data.length === 0) {
		await writeFile(filePath, "", "utf8");
		return;
	}

	// Collect all unique keys across all records
	const allKeys = new Set<string>();
	const flattenedData = data.map((item) => {
		const flat = flatten(item);
		for (const key of Object.keys(flat)) {
			allKeys.add(key);
		}
		return flat;
	});

	const headers = Array.from(allKeys).sort();
	const rows = [headers.join(",")];

	for (const record of flattenedData) {
		const values = headers.map((header) => {
			const value = record[header];
			return escapeCsvValue(value);
		});
		rows.push(values.join(","));
	}

	await writeFile(filePath, rows.join("\n"), "utf8");
}

export const __filename = fileURLToPath(import.meta.url);
export const __dirname = path.dirname(__filename);
