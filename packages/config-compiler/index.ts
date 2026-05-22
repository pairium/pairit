/**
 * Shared experiment-config compile pipeline.
 *
 * Takes raw YAML source and produces the canonical compiled JSON the lab
 * consumes, plus top-level flags that are stored alongside the config but
 * stripped from the compiled doc itself.
 *
 * Used by the CLI (`pairit config upload`) and the manager server's
 * web-upload endpoint so both paths produce byte-identical output.
 */

import { createHash } from "node:crypto";
import YAML from "yaml";

export type ExperimentPage = {
	id: string;
	onEnter?: unknown[];
	components?: unknown[];
};

export type ExperimentConfig = {
	schema_version?: string;
	initialPageId?: string;
	pages?: ExperimentPage[];
	agents?: unknown[];
	matchmaking?: unknown;
	allowRetake?: boolean;
	requireAuth?: boolean;
};

export type MatchmakingPoolConfig = {
	id: string;
	num_users?: number;
	timeoutSeconds?: number;
	timeoutTarget?: string;
	assignment?: {
		type?: "random" | "balanced_random" | "block";
		conditions?: string[];
	};
};

export type ComponentWithProps = {
	type: string;
	id?: string;
	props?: Record<string, unknown>;
};

export type CompiledConfig = {
	/** Compiled, canonical config object — what the lab runtime consumes. */
	config: Record<string, unknown>;
	/** Stable hash of the canonical JSON encoding of `config`. */
	checksum: string;
	/** First 12 bytes of the checksum, base64url-encoded. Used as default configId. */
	defaultConfigId: string;
	/** Top-level flag stripped from `config` and stored separately. */
	requireAuth: boolean | undefined;
	/** Top-level flag stripped from `config` and stored separately. */
	allowRetake: boolean;
};

export class ConfigParseError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ConfigParseError";
	}
}

export class ConfigValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ConfigValidationError";
	}
}

export function parseYaml(source: string): ExperimentConfig {
	let parsed: unknown;
	try {
		parsed = YAML.parse(source);
	} catch (err) {
		throw new ConfigParseError(
			err instanceof Error ? err.message : "YAML parse error",
		);
	}
	if (!parsed || typeof parsed !== "object") {
		throw new ConfigParseError("config must be an object");
	}
	return parsed as ExperimentConfig;
}

export function lintConfig(config: ExperimentConfig): void {
	const errors: string[] = [];
	if (!config.schema_version) errors.push("missing schema_version");
	if (!config.initialPageId) errors.push("missing initialPageId");
	if (!Array.isArray(config.pages) || config.pages.length === 0) {
		errors.push("pages must be a non-empty array");
	}
	if (Array.isArray(config.pages)) {
		config.pages.forEach((page, index) => {
			if (!page.id) errors.push(`pages[${index}] is missing id`);
		});
	}
	if (errors.length) throw new ConfigValidationError(errors.join(", "));
}

/**
 * Build the canonical compiled object. Mirrors the previous CLI behavior:
 * - auto-generates missing component IDs (`type-index`)
 * - flattens matchmaking pool configs into matchmaking components
 * - falls back `initialPageId` to the first page when missing
 * - strips top-level flags (`allowRetake`, `requireAuth`) — those are returned
 *   separately and stored alongside the config doc.
 */
export function buildCompiled(
	config: ExperimentConfig,
): Record<string, unknown> {
	const poolConfigs = new Map<string, MatchmakingPoolConfig>();
	if (Array.isArray(config.matchmaking)) {
		for (const pool of config.matchmaking as MatchmakingPoolConfig[]) {
			if (pool.id) poolConfigs.set(pool.id, pool);
		}
	}

	const pages: Record<string, Record<string, unknown>> = {};
	for (const page of config.pages ?? []) {
		const { id, ...rest } = page;
		if (Array.isArray(rest.components)) {
			rest.components = (rest.components as ComponentWithProps[]).map(
				(comp, index) => {
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
	if (config.agents) output.agents = config.agents;
	if (config.matchmaking) output.matchmaking = config.matchmaking;
	return output;
}

function toBase64Url(buf: Buffer | Uint8Array): string {
	return Buffer.from(buf)
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "");
}

/**
 * End-to-end compile: YAML source → compiled object + checksum + default id +
 * top-level flags. Throws ConfigParseError / ConfigValidationError on failure.
 */
export function compileYaml(source: string): CompiledConfig {
	const parsed = parseYaml(source);
	lintConfig(parsed);
	const compiled = buildCompiled(parsed);
	const canonical = JSON.stringify(compiled, null, 2);
	const hash = createHash("sha256").update(canonical).digest();
	return {
		config: compiled,
		checksum: hash.toString("hex"),
		defaultConfigId: toBase64Url(hash.subarray(0, 12)),
		requireAuth: parsed.requireAuth,
		allowRetake: parsed.allowRetake === true,
	};
}
