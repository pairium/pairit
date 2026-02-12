/**
 * Agent Runner
 * Orchestrates AI agent responses to chat messages
 */

import { getAgentById, getPageAgentIds, getSessionConfig } from "./agents";
import {
	getChatMessagesCollection,
	getEventsCollection,
	getSessionsCollection,
} from "./db";
import type { AgentConfig, ChatMessage } from "./llm";
import { streamAgentResponse } from "./llm";
import { broadcastToSession, getConnectionCount } from "./sse";

const AGENT_TIMEOUT_MS = 60_000;

const activeRuns = new Map<string, AbortController>();

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

	const { configId, currentPageId } = sessionConfig;

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

		await runAgent(agent, groupId, sessionId);
	}
}

async function runAgent(
	agent: AgentConfig,
	groupId: string,
	sessionId: string,
): Promise<void> {
	const abortController = new AbortController();
	activeRuns.set(groupId, abortController);

	const timeout = setTimeout(() => {
		console.log(`[Agent] Timeout for group ${groupId}`);
		abortController.abort();
	}, AGENT_TIMEOUT_MS);

	try {
		const history = await loadChatHistory(groupId);

		if (history.length === 0) {
			return;
		}

		if (getConnectionCount(sessionId) === 0) {
			console.log(
				`[Agent] No SSE connections for session ${sessionId}, skipping`,
			);
			return;
		}

		let fullText = "";
		const toolCalls: Array<{ name: string; args: Record<string, unknown> }> =
			[];

		for await (const delta of streamAgentResponse(
			agent,
			history,
			abortController.signal,
		)) {
			if (delta.type === "text_delta") {
				fullText += delta.text;
			} else if (delta.type === "tool_call") {
				toolCalls.push({ name: delta.name, args: delta.args });
			}
		}

		if (fullText.trim()) {
			await persistAndBroadcastMessage(
				groupId,
				`agent:${agent.id}`,
				"agent",
				fullText,
			);
		}

		const memberIds = await getGroupMembers(groupId);
		for (const toolCall of toolCalls) {
			await handleToolCall(
				toolCall.name,
				toolCall.args,
				groupId,
				sessionId,
				memberIds,
			);
		}
	} catch (error) {
		if ((error as Error).name === "AbortError") {
			console.log(`[Agent] Run aborted for group ${groupId}`);
		} else {
			console.error(`[Agent] Error running agent ${agent.id}:`, error);
			await persistAndBroadcastMessage(
				groupId,
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
	senderId: string,
	senderType: "participant" | "agent" | "system",
	content: string,
): Promise<void> {
	const collection = await getChatMessagesCollection();
	const now = new Date();

	const result = await collection.insertOne({
		groupId,
		sessionId: senderId,
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

async function getGroupMembers(groupId: string): Promise<string[]> {
	const sessionsCollection = await getSessionsCollection();
	const sessions = await sessionsCollection
		.find({ "user_state.chat_group_id": groupId })
		.project({ id: 1 })
		.toArray();

	const memberIds = sessions.map((s) => s.id);

	if (!memberIds.includes(groupId)) {
		memberIds.push(groupId);
	}

	return memberIds;
}

async function handleToolCall(
	name: string,
	args: Record<string, unknown>,
	groupId: string,
	sessionId: string,
	memberIds: string[],
): Promise<void> {
	await logToolCallEvent(name, args, sessionId);

	if (name === "end_chat") {
		console.log(`[Agent] Tool: end_chat for group ${groupId}`);
		for (const memberId of memberIds) {
			broadcastToSession(memberId, "chat_ended", { groupId });
		}
	}

	if (name === "assign_state") {
		const { path, value } = args as { path?: string; value?: unknown };
		if (!path) {
			console.error("[Agent] assign_state missing path");
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
): Promise<void> {
	try {
		const collection = await getEventsCollection();
		await collection.insertOne({
			type: "agent_tool_call",
			timestamp: new Date().toISOString(),
			sessionId,
			configId: "",
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

export function cancelAgentRun(groupId: string): boolean {
	const controller = activeRuns.get(groupId);
	if (controller) {
		controller.abort();
		activeRuns.delete(groupId);
		return true;
	}
	return false;
}

export function isAgentRunning(groupId: string): boolean {
	return activeRuns.has(groupId);
}
