/**
 * Agent Runner
 * Orchestrates AI agent responses to chat messages
 */

import {
	getAgentsFromConfig,
	getPageAgentIdsFromConfig,
	getSessionConfig,
} from "./agents";
import {
	getChatMessagesCollection,
	getEventsCollection,
	getSessionsCollection,
} from "./db";
import { getGroupMembers } from "./groups";
import type { AgentConfig, ChatMessage, ReplyCondition, Trigger } from "./llm";
import { streamAgentResponse } from "./llm";
import { getLlmCredentialsForConfig } from "./llm-credentials";
import { resolveSystemPrompt } from "./prompt-resolver";
import { broadcastToSession, getConnectionCount } from "./sse";
import {
	editWorkspace,
	getWorkspaceSettings,
	openWorkspace,
	readWorkspace,
	type Workspace,
	workspaceGroupId,
} from "./workspace";
import type { WorkspaceEdit } from "./workspace-edit";

const AGENT_TIMEOUT_MS = 60_000;

const activeGroupRuns = new Set<string>();

async function withGroupRunLock(
	groupId: string,
	callback: () => Promise<void>,
): Promise<void> {
	if (activeGroupRuns.has(groupId)) {
		return;
	}

	activeGroupRuns.add(groupId);
	try {
		await callback();
	} finally {
		activeGroupRuns.delete(groupId);
	}
}

function resolveTriggers(agent: AgentConfig): Trigger[] {
	if (!agent.trigger) return ["every_message"];
	return Array.isArray(agent.trigger) ? agent.trigger : [agent.trigger];
}

function resolveConditions(agent: AgentConfig): ReplyCondition[] {
	if (!agent.replyCondition) return ["always"];
	return Array.isArray(agent.replyCondition)
		? agent.replyCondition
		: [agent.replyCondition];
}

async function evaluateConditions(
	agent: AgentConfig,
	history: ChatMessage[],
	configId: string,
): Promise<boolean> {
	const conditions = resolveConditions(agent);

	const credentials = await getLlmCredentialsForConfig(configId);

	for (const condition of conditions) {
		if (condition === "always") continue;

		const prompt = typeof condition === "string" ? condition : condition.prompt;

		const conditionAgent: AgentConfig = {
			id: agent.id,
			model: agent.model,
			system: `You are a reply-condition evaluator. Based on the conversation history, decide whether the agent should reply.\n\nCondition: ${prompt}\n\nRespond with exactly "yes" or "no", nothing else.`,
		};

		let response = "";
		for await (const delta of streamAgentResponse(conditionAgent, history, {
			credentials,
		})) {
			if (delta.type === "text_delta") response += delta.text;
		}

		if (!response.trim().toLowerCase().startsWith("yes")) {
			return false;
		}
	}

	return true;
}

async function countParticipantMessagesSinceAgent(
	groupId: string,
	agentId: string,
): Promise<number> {
	const collection = await getChatMessagesCollection();

	const lastAgentMsg = await collection.findOne(
		{ groupId, senderId: `agent:${agentId}` },
		{ sort: { createdAt: -1 } },
	);

	const filter: Record<string, unknown> = {
		groupId,
		senderType: "participant",
	};
	if (lastAgentMsg) {
		filter.createdAt = { $gt: lastAgentMsg.createdAt };
	}

	return collection.countDocuments(filter);
}

export async function triggerAgents(
	groupId: string,
	sessionId: string,
): Promise<void> {
	await withGroupRunLock(groupId, async () => {
		const sessionConfig = await getSessionConfig(sessionId);
		if (!sessionConfig) {
			return;
		}

		const { configId, currentPageId, sessionState, config } = sessionConfig;

		const agentIds = getPageAgentIdsFromConfig(config, currentPageId);
		if (agentIds.length === 0) {
			return;
		}

		const agents = getAgentsFromConfig(config);
		for (const agentId of agentIds) {
			const agent = agents.find((a) => a.id === agentId);
			if (!agent) {
				console.error(`[Agent] Agent not found: ${agentId}`);
				continue;
			}

			const triggers = resolveTriggers(agent);
			let shouldRun = false;

			for (const trigger of triggers) {
				if (trigger === "every_message") {
					shouldRun = true;
					break;
				}
				if (typeof trigger === "object" && "every" in trigger) {
					const count = await countParticipantMessagesSinceAgent(
						groupId,
						agent.id,
					);
					if (count >= trigger.every) {
						shouldRun = true;
						break;
					}
				}
				// "on_join" is irrelevant in the message-triggered path
			}

			if (!shouldRun) continue;

			await runAgent(agent, groupId, sessionId, {
				requireHistory: true,
				configId,
				pageId: currentPageId,
				sessionState,
				config,
			});
		}
	});
}

/**
 * Trigger agents on chat page join
 * Handles both legacy sendFirstMessage and new on_join trigger
 */
export async function triggerJoinAgents(
	groupId: string,
	sessionId: string,
): Promise<void> {
	await withGroupRunLock(groupId, async () => {
		const chatCollection = await getChatMessagesCollection();
		const existingCount = await chatCollection.countDocuments(
			{ groupId },
			{ limit: 1 },
		);

		const sessionConfig = await getSessionConfig(sessionId);
		if (!sessionConfig) {
			return;
		}

		const { configId, currentPageId, sessionState, config } = sessionConfig;

		const agentIds = getPageAgentIdsFromConfig(config, currentPageId);
		if (agentIds.length === 0) {
			return;
		}

		const agents = getAgentsFromConfig(config);
		for (const agentId of agentIds) {
			const agent = agents.find((a) => a.id === agentId);
			if (!agent) {
				console.error(`[Agent] Agent not found: ${agentId}`);
				continue;
			}

			const triggers = resolveTriggers(agent);
			const hasOnJoin = triggers.includes("on_join");
			const hasExplicitTrigger = agent.trigger !== undefined;
			const isLegacy = !hasExplicitTrigger && agent.sendFirstMessage === true;

			if (hasOnJoin) {
				await runAgent(agent, groupId, sessionId, {
					requireHistory: false,
					configId,
					pageId: currentPageId,
					sessionState,
					config,
				});
			} else if (isLegacy && existingCount === 0) {
				await runAgent(agent, groupId, sessionId, {
					requireHistory: false,
					configId,
					pageId: currentPageId,
					sessionState,
					config,
				});
			}
		}
	});
}

type RunAgentOptions = {
	requireHistory?: boolean;
	configId?: string;
	pageId?: string;
	sessionState?: Record<string, unknown>;
	config?: unknown;
};

/** The workspace on the agent's page, as the triggering session sees it. */
async function openPageWorkspace(
	sessionId: string,
	options: RunAgentOptions,
): Promise<Workspace | null> {
	if (!options.pageId) return null;
	const settings = getWorkspaceSettings(options.config, options.pageId);
	if (!settings) return null;
	return openWorkspace(
		workspaceGroupId(settings, sessionId, options.pageId, options.sessionState),
		options.pageId,
		options.configId ?? "",
		settings,
	);
}

async function runAgent(
	agent: AgentConfig,
	groupId: string,
	sessionId: string,
	options: RunAgentOptions = {},
): Promise<void> {
	const { requireHistory = true, configId = "" } = options;
	const abortController = new AbortController();

	const timeout = setTimeout(() => {
		console.log(`[Agent] Timeout for group ${groupId}`);
		abortController.abort();
	}, AGENT_TIMEOUT_MS);

	try {
		const history = await loadChatHistory(groupId);

		// Skip if history is required but empty (normal message response flow)
		if (requireHistory && history.length === 0) {
			return;
		}

		// Evaluate reply conditions before proceeding
		const shouldReply = await evaluateConditions(agent, history, configId);
		if (!shouldReply) {
			return;
		}

		if (getConnectionCount(sessionId) === 0) {
			console.log(
				`[Agent] No SSE connections for session ${sessionId}, proceeding anyway`,
			);
		}

		const credentials = await getLlmCredentialsForConfig(configId);

		// Resolve conditional prompts and interpolate session_state
		const resolvedSystem = resolveSystemPrompt(
			agent.system,
			agent.prompts,
			options.sessionState,
		);

		// Build system prompt: guardrail prefix + experimenter prompt + workspace
		const agentWithContext = { ...agent, system: resolvedSystem };

		// Prepend guardrail instructions unless explicitly opted out
		if (agent.guardrails !== false) {
			const guardrailPrefix = [
				"IMPORTANT GUIDELINES:",
				"- Do NOT answer questions about the experiment itself — its process, procedures, compensation, duration, or participant rights.",
				'- If a participant asks about these topics, say: "That\'s a great question — please direct it to the researcher."',
				"- Stay in your assigned role. Do not pretend to be a researcher or experiment administrator.",
				"- Do not make promises or commitments on behalf of the research team.",
			].join("\n");
			agentWithContext.system = `${guardrailPrefix}\n\n${resolvedSystem}`;
		}

		// Inject workspace content into agent system prompt if available
		const workspace = await openPageWorkspace(sessionId, options);
		const workspaceRead = workspace ? readWorkspace(workspace) : null;
		if (workspace && workspaceRead) {
			const label =
				workspace.settings.mode === "freeform" ? "Content" : "Fields";
			const text = workspaceRead.text || "(empty)";
			agentWithContext.system += `\n\n--- Current Workspace ${label} ---\n${text}\n--- End Workspace ${label} ---`;
		}

		// Get members early so we can stream deltas to them
		const memberIds = await getGroupMembers(groupId);
		const streamId = `stream-${Date.now()}-${Math.random().toString(36).slice(2)}`;
		const senderId = `agent:${agent.id}`;

		// Show typing indicator immediately
		for (const memberId of memberIds) {
			broadcastToSession(memberId, "chat_message_delta", {
				streamId,
				groupId,
				senderId,
				senderType: "agent",
				avatar: agent.avatar,
				delta: "",
				fullText: "",
			});
		}

		let fullText = "";
		const toolCalls: Array<{ name: string; args: Record<string, unknown> }> =
			[];

		for await (const delta of streamAgentResponse(agentWithContext, history, {
			credentials,
			signal: abortController.signal,
		})) {
			if (delta.type === "text_delta") {
				fullText += delta.text;
				// Broadcast delta to all members for real-time streaming
				for (const memberId of memberIds) {
					broadcastToSession(memberId, "chat_message_delta", {
						streamId,
						groupId,
						senderId,
						senderType: "agent",
						avatar: agent.avatar,
						delta: delta.text,
						fullText,
					});
				}
			} else if (delta.type === "tool_call") {
				toolCalls.push({ name: delta.name, args: delta.args });
			}
		}

		if (fullText.trim()) {
			await persistAndBroadcastMessage(
				groupId,
				sessionId,
				configId,
				senderId,
				"agent",
				fullText,
				agent.avatar,
			);
		}

		for (const toolCall of toolCalls) {
			await handleToolCall(
				toolCall.name,
				toolCall.args,
				groupId,
				sessionId,
				memberIds,
				configId,
				agent.id,
				workspace,
				workspaceRead?.base,
			);
		}

		// Clear streaming indicator if agent produced no text (tool-only response)
		if (!fullText.trim()) {
			for (const memberId of memberIds) {
				broadcastToSession(memberId, "chat_stream_end", {
					streamId,
					groupId,
					senderId,
				});
			}
		}
	} catch (error) {
		if ((error as Error).name === "AbortError") {
			console.log(`[Agent] Run aborted for group ${groupId}`);
		} else {
			console.error(`[Agent] Error running agent ${agent.id}:`, error);
			await persistAndBroadcastMessage(
				groupId,
				sessionId,
				configId,
				"system",
				"system",
				"Sorry, I encountered an error. Please try again.",
			);
		}
	} finally {
		clearTimeout(timeout);
	}
}

async function loadChatHistory(groupId: string): Promise<ChatMessage[]> {
	const collection = await getChatMessagesCollection();
	const messages = await collection
		.find({ groupId })
		.sort({ createdAt: 1 })
		.toArray();

	return messages.map((msg) => ({
		role: msg.senderType === "agent" ? "assistant" : "user",
		content: msg.content,
	}));
}

async function persistAndBroadcastMessage(
	groupId: string,
	sessionId: string,
	configId: string,
	senderId: string,
	senderType: "participant" | "agent" | "system",
	content: string,
	avatar?: AgentConfig["avatar"],
): Promise<void> {
	const collection = await getChatMessagesCollection();
	const now = new Date();

	const result = await collection.insertOne({
		groupId,
		sessionId,
		configId,
		senderId,
		senderType,
		content,
		createdAt: now,
		...(avatar && { avatar }),
	});

	const messageId = result.insertedId.toString();

	const memberIds = await getGroupMembers(groupId);
	const eventData = {
		messageId,
		groupId,
		sessionId: senderId,
		senderId,
		senderType,
		content,
		createdAt: now.toISOString(),
		avatar,
	};

	for (const memberId of memberIds) {
		broadcastToSession(memberId, "chat_message", eventData);
	}
}

async function handleToolCall(
	name: string,
	args: Record<string, unknown>,
	groupId: string,
	sessionId: string,
	memberIds: string[],
	configId: string,
	agentId: string,
	workspace: Workspace | null,
	// The workspace as the agent read it; its write is merged against this
	workspaceBase: Uint8Array | undefined,
): Promise<void> {
	await logToolCallEvent(name, args, sessionId, configId);

	if (name === "end_chat") {
		const { deal_reached, agreed_price } = args as {
			deal_reached?: boolean;
			agreed_price?: number;
		};
		console.log(
			`[Agent] Tool: end_chat for group ${groupId} (deal_reached=${deal_reached}, agreed_price=${agreed_price})`,
		);

		// Set chat_ended and deal info in session_state for all members
		const sessionsCollection = await getSessionsCollection();
		for (const memberId of memberIds) {
			if (memberId.startsWith("agent:")) continue;

			const stateUpdates: Record<string, unknown> = {
				"session_state.chat_ended": true,
			};
			if (deal_reached !== undefined) {
				stateUpdates["session_state.deal_reached"] = deal_reached;
			}
			if (agreed_price !== undefined) {
				stateUpdates["session_state.agreed_price"] = agreed_price;
			}

			await sessionsCollection.updateOne(
				{ id: memberId },
				{ $set: { ...stateUpdates, updatedAt: new Date() } },
			);

			broadcastToSession(memberId, "state_updated", {
				path: "chat_ended",
				value: true,
			});
			if (deal_reached !== undefined) {
				broadcastToSession(memberId, "state_updated", {
					path: "deal_reached",
					value: deal_reached,
				});
			}
			if (agreed_price !== undefined) {
				broadcastToSession(memberId, "state_updated", {
					path: "agreed_price",
					value: agreed_price,
				});
			}
			broadcastToSession(memberId, "chat_ended", { groupId });
		}
	}

	if (name === "write_workspace") {
		const { content, fields } = args as {
			content?: unknown;
			fields?: unknown;
		};
		console.log(`[Agent] Tool: write_workspace for group ${groupId}`);
		if (!workspace) {
			console.error("[Agent] write_workspace: no workspace on this page");
			return;
		}
		let edit: WorkspaceEdit | null = null;
		if (typeof content === "string") {
			edit = { kind: "write", content };
		} else if (fields && typeof fields === "object") {
			edit = { kind: "fields", fields: fields as Record<string, unknown> };
		}
		if (!edit) {
			console.error("[Agent] write_workspace: needs content or fields");
			return;
		}
		try {
			await editWorkspace(workspace, edit, `agent:${agentId}`, workspaceBase);
		} catch (error) {
			console.error(
				`[Agent] write_workspace refused: ${(error as Error).message}`,
			);
		}
	}

	if (name === "assign_state") {
		const { path, value } = args as { path?: string; value?: unknown };
		if (!path) {
			console.error("[Agent] assign_state missing path");
			return;
		}

		if (path.includes("$") || path.startsWith(".") || path.endsWith(".")) {
			console.error(`[Agent] assign_state invalid path: ${path}`);
			return;
		}

		console.log(
			`[Agent] Tool: assign_state path=${path} value=${JSON.stringify(value)}`,
		);

		const sessionsCollection = await getSessionsCollection();
		for (const memberId of memberIds) {
			if (memberId.startsWith("agent:")) continue;

			await sessionsCollection.updateOne(
				{ id: memberId },
				{ $set: { [`session_state.${path}`]: value, updatedAt: new Date() } },
			);

			broadcastToSession(memberId, "state_updated", { path, value });
		}
	}
}

async function logToolCallEvent(
	toolName: string,
	args: Record<string, unknown>,
	sessionId: string,
	configId: string,
): Promise<void> {
	try {
		const collection = await getEventsCollection();
		await collection.insertOne({
			type: "agent_tool_call",
			timestamp: new Date().toISOString(),
			sessionId,
			configId,
			pageId: "",
			componentType: "chat",
			componentId: "",
			data: { toolName, args },
			idempotencyKey: `tool-${Date.now()}-${Math.random().toString(36).slice(2)}`,
			createdAt: new Date(),
		});
	} catch (error) {
		console.error("[Agent] Failed to log tool call event:", error);
	}
}
