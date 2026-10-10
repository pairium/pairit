/**
 * Agent configuration resolution
 * Reads agents from the config a session started on, or from local files
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { getSessionsCollection } from "./db";
import type { AgentConfig, ReplyCondition, Trigger } from "./llm";

type RawAgent = {
	id?: string;
	model?: string;
	system?: string;
	avatar?: {
		icon?: string;
		image?: string;
	};
	sendFirstMessage?: boolean;
	trigger?: Trigger | Trigger[];
	replyCondition?: ReplyCondition | ReplyCondition[];
	guardrails?: boolean;
	reasoningEffort?: "minimal" | "low" | "medium" | "high";
	tools?: Array<{
		name: string;
		description: string;
		parameters?: Record<string, unknown>;
	}>;
	prompts?: Array<{ when?: string; system: string }>;
};

function isValidAgent(raw: unknown): raw is RawAgent {
	if (!raw || typeof raw !== "object") return false;
	const obj = raw as Record<string, unknown>;
	return (
		typeof obj.id === "string" &&
		typeof obj.model === "string" &&
		typeof obj.system === "string"
	);
}

function toAgentConfig(raw: RawAgent): AgentConfig {
	return {
		id: raw.id ?? "",
		model: raw.model ?? "",
		system: raw.system ?? "",
		avatar: raw.avatar,
		sendFirstMessage: raw.sendFirstMessage,
		trigger: raw.trigger,
		replyCondition: raw.replyCondition,
		guardrails: raw.guardrails,
		reasoningEffort: raw.reasoningEffort,
		tools: raw.tools,
		prompts: raw.prompts,
	};
}

/**
 * Agents defined in a compiled config. Pure: callers pass the config the
 * session started on so agents and pages come from the same revision.
 */
export function getAgentsFromConfig(config: unknown): AgentConfig[] {
	if (!config || typeof config !== "object") return [];
	const agents = (config as { agents?: unknown }).agents;
	if (!Array.isArray(agents)) return [];
	return agents.filter(isValidAgent).map(toAgentConfig);
}

type PageShape = {
	id: string;
	components?: Array<{ type: string; props?: { agents?: string[] } }>;
};

/** Agent ids referenced by chat and live-workspace components on a page. */
export function getPageAgentIdsFromConfig(
	config: unknown,
	pageId: string,
): string[] {
	if (!config || typeof config !== "object") return [];
	const { pages, nodes } = config as {
		pages?: Record<string, PageShape>;
		nodes?: PageShape[];
	};

	const page =
		pages?.[pageId] ??
		(Array.isArray(nodes) ? nodes.find((n) => n.id === pageId) : undefined);
	if (!page) return [];

	const agentIds: string[] = [];
	for (const c of page.components ?? []) {
		if (
			(c.type === "chat" || c.type === "live-workspace") &&
			Array.isArray(c.props?.agents)
		) {
			agentIds.push(...c.props.agents);
		}
	}
	return agentIds;
}

async function readLocalConfig(configId: string): Promise<unknown> {
	try {
		// Configs are in the lab app's public folder, not the server's cwd
		const configPath = path.join(
			process.cwd(),
			"..",
			"app",
			"public",
			"configs",
			`${configId}.json`,
		);
		return JSON.parse(await readFile(configPath, "utf8"));
	} catch {
		return null;
	}
}

/**
 * Session context for running agents. `config` is the config the session
 * started on (stored on the session document), not the live `configs` doc, so
 * a mid-session re-upload cannot change which agents run. Configs that were
 * never in Mongo fall back to the lab app's local config file.
 */
export async function getSessionConfig(sessionId: string): Promise<{
	configId: string;
	currentPageId: string;
	sessionState: Record<string, unknown> | undefined;
	config: unknown;
} | null> {
	const collection = await getSessionsCollection();
	const session = await collection.findOne(
		{ id: sessionId },
		{
			projection: {
				configId: 1,
				currentPageId: 1,
				session_state: 1,
				config: 1,
			},
		},
	);

	if (!session) return null;

	const stored: unknown = session.config;
	const config =
		stored && typeof stored === "object"
			? stored
			: await readLocalConfig(session.configId);

	return {
		configId: session.configId,
		currentPageId: session.currentPageId,
		sessionState: session.session_state as Record<string, unknown> | undefined,
		config,
	};
}
