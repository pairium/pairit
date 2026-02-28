/**
 * Agent Runner
 * Orchestrates AI agent responses to chat messages
 */

import { getAgentById, getPageAgentIds, getSessionConfig } from "./agents";
import {
	getChatMessagesCollection,
	getEventsCollection,
	getSessionsCollection,
	getWorkspaceDocumentsCollection,
} from "./db";
import { getGroupMembers } from "./groups";
import type { AgentConfig, ChatMessage, ReplyCondition, Trigger } from "./llm";
import { streamAgentResponse } from "./llm";
import { resolveSystemPrompt } from "./prompt-resolver";
import { broadcastToSession, getConnectionCount } from "./sse";

const AGENT_TIMEOUT_MS = 60_000;

const activeRuns = new Map<string, AbortController>();

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
): Promise<boolean> {
	const conditions = resolveConditions(agent);

	for (const condition of conditions) {
		if (condition === "always") continue;

		const prompt = typeof condition === "string" ? condition : condition.prompt;

		const conditionAgent: AgentConfig = {
			id: agent.id,
			model: agent.model,
			system: `You are a reply-condition evaluator. Based on the conversation history, decide whether the agent should reply.\n\nCondition: ${prompt}\n\nRespond with exactly "yes" or "no", nothing else.`,
		};

		let response = "";
		for await (const delta of streamAgentResponse(conditionAgent, history)) {
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
	if (activeRuns.has(groupId)) {
		return;
	}

	const sessionConfig = await getSessionConfig(sessionId);
	if (!sessionConfig) {
		return;
	}

	const { configId, currentPageId, userState } = sessionConfig;

	const agentIds = await getPageAgentIds(configId, currentPageId);
	if (agentIds.length === 0) {
		return;
	}

	for (const agentId of agentIds) {
		const agent = await getAgentById(configId, agentId);
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
			userState,
		});
	}
}

/**
 * Trigger agents on chat page join
 * Handles both legacy sendFirstMessage and new on_join trigger
 */
export async function triggerJoinAgents(
	groupId: string,
	sessionId: string,
): Promise<void> {
	if (activeRuns.has(groupId)) {
		return;
	}

	const chatCollection = await getChatMessagesCollection();
	const existingCount = await chatCollection.countDocuments(
		{ groupId },
		{ limit: 1 },
	);

	const sessionConfig = await getSessionConfig(sessionId);
	if (!sessionConfig) {
		return;
	}

	const { configId, currentPageId, userState } = sessionConfig;

	const agentIds = await getPageAgentIds(configId, currentPageId);
	if (agentIds.length === 0) {
		return;
	}

	for (const agentId of agentIds) {
		const agent = await getAgentById(configId, agentId);
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
				userState,
			});
		} else if (isLegacy && existingCount === 0) {
			await runAgent(agent, groupId, sessionId, {
				requireHistory: false,
				configId,
				pageId: currentPageId,
				userState,
			});
		}
	}
}

type RunAgentOptions = {
	requireHistory?: boolean;
	configId?: string;
	pageId?: string;
	userState?: Record<string, unknown>;
};

async function runAgent(
	agent: AgentConfig,
	groupId: string,
	sessionId: string,
	options: RunAgentOptions = {},
): Promise<void> {
	const { requireHistory = true, configId = "" } = options;
	const abortController = new AbortController();
	activeRuns.set(groupId, abortController);

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
		const shouldReply = await evaluateConditions(agent, history);
		if (!shouldReply) {
			return;
		}

		if (getConnectionCount(sessionId) === 0) {
			console.log(
				`[Agent] No SSE connections for session ${sessionId}, skipping`,
			);
			return;
		}

		// Resolve conditional prompts and interpolate user_state
		const resolvedSystem = resolveSystemPrompt(
			agent.system,
			agent.prompts,
			options.userState,
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
		const workspaceCollection = await getWorkspaceDocumentsCollection();
		const workspaceDoc = await workspaceCollection.findOne({ groupId });
		if (workspaceDoc) {
			const workspaceSection =
				workspaceDoc.mode === "freeform"
					? `\n\n--- Current Workspace Content ---\n${workspaceDoc.content ?? "(empty)"}\n--- End Workspace Content ---`
					: `\n\n--- Current Workspace Fields ---\n${JSON.stringify(workspaceDoc.fields ?? {}, null, 2)}\n--- End Workspace Fields ---`;
			agentWithContext.system = agentWithContext.system + workspaceSection;
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
				delta: "",
				fullText: "",
			});
		}

		let fullText = "";
		const toolCalls: Array<{ name: string; args: Record<string, unknown> }> =
			[];

		for await (const delta of streamAgentResponse(
			agentWithContext,
			history,
			abortController.signal,
		)) {
			if (delta.type === "text_delta") {
				fullText += delta.text;
				// Broadcast delta to all members for real-time streaming
				for (const memberId of memberIds) {
					broadcastToSession(memberId, "chat_message_delta", {
						streamId,
						groupId,
						senderId,
						senderType: "agent",
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
				senderId,
				"agent",
				fullText,
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
				"system",
				"system",
				"Sorry, I encountered an error. Please try again.",
			);
		}
	} finally {
		clearTimeout(timeout);
		activeRuns.delete(groupId);
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
	senderId: string,
	senderType: "participant" | "agent" | "system",
	content: string,
): Promise<void> {
	const collection = await getChatMessagesCollection();
	const now = new Date();

	const result = await collection.insertOne({
		groupId,
		sessionId,
		senderId,
		senderType,
		content,
		createdAt: now,
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

		// Set chat_ended and deal info in user_state for all members
		const sessionsCollection = await getSessionsCollection();
		for (const memberId of memberIds) {
			if (memberId.startsWith("agent:")) continue;

			const stateUpdates: Record<string, unknown> = {
				"user_state.chat_ended": true,
			};
			if (deal_reached !== undefined) {
				stateUpdates["user_state.deal_reached"] = deal_reached;
			}
			if (agreed_price !== undefined) {
				stateUpdates["user_state.agreed_price"] = agreed_price;
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
			content?: string;
			fields?: Record<string, unknown>;
		};
		console.log(`[Agent] Tool: write_workspace for group ${groupId}`);

		const wsCollection = await getWorkspaceDocumentsCollection();
		const now = new Date();

		const updateFields: Record<string, unknown> = {
			updatedBy: `agent:${sessionId}`,
			updatedAt: now,
		};
		if (content !== undefined) updateFields.content = content;
		if (fields !== undefined) updateFields.fields = fields;

		await wsCollection.updateOne(
			{ groupId },
			{
				$set: updateFields,
				$setOnInsert: {
					groupId,
					mode: content !== undefined ? "freeform" : "structured",
					configId,
					createdAt: now,
				},
			},
			{ upsert: true },
		);

		const eventData = {
			groupId,
			content,
			fields,
			updatedBy: `agent:${sessionId}`,
			updatedAt: now.toISOString(),
		};

		for (const memberId of memberIds) {
			broadcastToSession(memberId, "workspace_updated", eventData);
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
				{ $set: { [`user_state.${path}`]: value, updatedAt: new Date() } },
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
