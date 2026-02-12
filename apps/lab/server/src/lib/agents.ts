/**
 * Agent configuration resolution
 * Loads agent configs from MongoDB or local files
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { getConfigsCollection, getSessionsCollection } from "./db";
import type { AgentConfig } from "./llm";

type RawAgent = {
	id?: string;
	model?: string;
	system?: string;
	tools?: Array<{
		name: string;
		description: string;
		parameters?: Record<string, unknown>;
	}>;
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
		tools: raw.tools,
	};
}

export async function getAgentsForConfig(
	configId: string,
): Promise<AgentConfig[]> {
	const collection = await getConfigsCollection();
	const doc = await collection.findOne({ configId });

	if (!doc?.config) {
		return tryLocalConfig(configId);
	}

	const raw = doc.config as { agents?: unknown[] };
	const agents = raw?.agents ?? [];

	return agents.filter(isValidAgent).map(toAgentConfig);
}

async function tryLocalConfig(configId: string): Promise<AgentConfig[]> {
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
		const content = await readFile(configPath, "utf8");
		const parsed = JSON.parse(content) as { agents?: unknown[] };
		const agents = parsed?.agents ?? [];
		return agents.filter(isValidAgent).map(toAgentConfig);
	} catch {
		return [];
	}
}

export async function getAgentById(
	configId: string,
	agentId: string,
): Promise<AgentConfig | null> {
	const agents = await getAgentsForConfig(configId);
	return agents.find((a) => a.id === agentId) ?? null;
}

export async function getSessionConfig(
	sessionId: string,
): Promise<{ configId: string; currentPageId: string } | null> {
	const collection = await getSessionsCollection();
	const session = await collection.findOne(
		{ id: sessionId },
		{ projection: { configId: 1, currentPageId: 1 } },
	);

	if (!session) return null;

	return {
		configId: session.configId,
		currentPageId: session.currentPageId,
	};
}

export async function getPageAgentIds(
	configId: string,
	pageId: string,
): Promise<string[]> {
	const collection = await getConfigsCollection();
	const doc = await collection.findOne({ configId });

	if (!doc?.config) {
		return tryLocalPageAgents(configId, pageId);
	}

	const config = doc.config as {
		nodes?: Array<{
			id: string;
			components?: Array<{ type: string; props?: { agents?: string[] } }>;
		}>;
	};

	const page = config.nodes?.find((n) => n.id === pageId);
	if (!page) {
		return [];
	}

	const chatComponent = page.components?.find((c) => c.type === "chat");
	return (chatComponent?.props?.agents as string[]) ?? [];
}

async function tryLocalPageAgents(
	configId: string,
	pageId: string,
): Promise<string[]> {
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
		const content = await readFile(configPath, "utf8");
		const parsed = JSON.parse(content) as {
			nodes?: Array<{
				id: string;
				components?: Array<{ type: string; props?: { agents?: string[] } }>;
			}>;
		};

		const page = parsed.nodes?.find((n) => n.id === pageId);
		if (!page) return [];

		const chatComponent = page.components?.find((c) => c.type === "chat");
		return (chatComponent?.props?.agents as string[]) ?? [];
	} catch {
		return [];
	}
}
