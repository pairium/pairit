/**
 * Unified LLM streaming adapter for OpenAI and Anthropic
 * Provides a consistent interface for streaming completions
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { ResolvedLlmCredentials } from "./llm-credentials";

export type Trigger = "every_message" | "on_join" | { every: number };

export type ReplyCondition =
	| "always"
	| string
	| { type: "llm"; prompt: string };

export type AgentAvatarConfig = {
	icon?: string;
	image?: string;
};

export type AgentConfig = {
	id: string;
	model: string;
	system: string;
	avatar?: AgentAvatarConfig;
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

export type ChatMessage = {
	role: "user" | "assistant";
	content: string;
};

export type StreamDelta =
	| { type: "text_delta"; text: string }
	| { type: "tool_call"; name: string; args: Record<string, unknown> }
	| { type: "done"; fullText: string };

type Provider = "openai" | "anthropic";

export type StreamAgentOptions = {
	credentials?: ResolvedLlmCredentials;
	signal?: AbortSignal;
};

function inferProvider(model: string): Provider {
	if (model.startsWith("claude")) return "anthropic";
	return "openai";
}

function getApiKey(
	provider: Provider,
	model: string,
	credentials?: ResolvedLlmCredentials,
): string {
	const apiKey =
		provider === "anthropic"
			? credentials?.anthropicApiKey
			: credentials?.openaiApiKey;

	if (!apiKey) {
		throw new Error(
			`Missing ${provider} API key for experiment. Upload one with the config before using model ${provider === "anthropic" ? "claude*" : model}`,
		);
	}

	return apiKey;
}

export async function* streamAgentResponse(
	agent: AgentConfig,
	history: ChatMessage[],
	options: StreamAgentOptions = {},
): AsyncGenerator<StreamDelta> {
	const provider = inferProvider(agent.model);

	if (provider === "anthropic") {
		yield* streamAnthropic(agent, history, options);
	} else {
		yield* streamOpenAI(agent, history, options);
	}
}

async function* streamOpenAI(
	agent: AgentConfig,
	history: ChatMessage[],
	options: StreamAgentOptions = {},
): AsyncGenerator<StreamDelta> {
	const client = new OpenAI({
		apiKey: getApiKey("openai", agent.model, options.credentials),
	});
	const messages: OpenAI.ChatCompletionMessageParam[] = history.map((m) => ({
		role: m.role,
		content: m.content,
	}));

	const tools: OpenAI.ChatCompletionTool[] | undefined = agent.tools?.map(
		(t) => ({
			type: "function",
			function: {
				name: t.name,
				description: t.description,
				parameters: t.parameters ?? { type: "object", properties: {} },
			},
		}),
	);

	const stream = await client.chat.completions.create(
		{
			model: agent.model,
			messages: [{ role: "system", content: agent.system }, ...messages],
			stream: true,
			tools: tools?.length ? tools : undefined,
			...(agent.reasoningEffort && { reasoning_effort: agent.reasoningEffort }),
		},
		{ signal: options.signal },
	);

	let fullText = "";
	const toolCalls: Map<number, { name: string; arguments: string }> = new Map();

	for await (const chunk of stream) {
		const delta = chunk.choices[0]?.delta;
		if (!delta) continue;

		if (delta.content) {
			fullText += delta.content;
			yield { type: "text_delta", text: delta.content };
		}

		if (delta.tool_calls) {
			for (const tc of delta.tool_calls) {
				if (tc.index !== undefined) {
					let existing = toolCalls.get(tc.index);
					if (!existing) {
						existing = { name: "", arguments: "" };
						toolCalls.set(tc.index, existing);
					}
					if (tc.function?.name) {
						existing.name = tc.function.name;
					}
					if (tc.function?.arguments) {
						existing.arguments += tc.function.arguments;
					}
				}
			}
		}
	}

	for (const [, tc] of toolCalls) {
		if (tc.name) {
			try {
				const args = tc.arguments ? JSON.parse(tc.arguments) : {};
				yield { type: "tool_call", name: tc.name, args };
			} catch {
				console.error(`[LLM] Failed to parse tool call args: ${tc.arguments}`);
			}
		}
	}

	yield { type: "done", fullText };
}

async function* streamAnthropic(
	agent: AgentConfig,
	history: ChatMessage[],
	options: StreamAgentOptions = {},
): AsyncGenerator<StreamDelta> {
	const client = new Anthropic({
		apiKey: getApiKey("anthropic", agent.model, options.credentials),
	});
	const messages: Anthropic.MessageParam[] = history.map((m) => ({
		role: m.role,
		content: m.content,
	}));

	const tools: Anthropic.Tool[] | undefined = agent.tools?.map((t) => ({
		name: t.name,
		description: t.description,
		input_schema: (t.parameters ?? {
			type: "object",
			properties: {},
		}) as Anthropic.Tool.InputSchema,
	}));

	const streamParams: Anthropic.MessageCreateParams = {
		model: agent.model,
		max_tokens: 4096,
		system: agent.system,
		messages,
		...(tools?.length && { tools }),
	};

	const stream = client.messages.stream(streamParams, {
		signal: options.signal,
	});

	let fullText = "";

	for await (const event of stream) {
		if (event.type === "content_block_delta") {
			const delta = event.delta;
			if ("text" in delta && delta.text) {
				fullText += delta.text;
				yield { type: "text_delta", text: delta.text };
			}
		}

		if (event.type === "content_block_stop") {
			const message = await stream.finalMessage();
			for (const block of message.content) {
				if (block.type === "tool_use") {
					yield {
						type: "tool_call",
						name: block.name,
						args: (block.input as Record<string, unknown>) ?? {},
					};
				}
			}
		}
	}

	yield { type: "done", fullText };
}
