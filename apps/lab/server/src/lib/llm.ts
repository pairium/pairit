/**
 * LLM streaming on the Vercel AI SDK
 * One interface for OpenAI and Anthropic. The SDK runs the tool loop: each
 * tool's execute result goes back to the model, for up to MAX_STEPS steps.
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { type LanguageModel, stepCountIs, streamText, type ToolSet } from "ai";
import type { ResolvedLlmCredentials } from "./llm-credentials";

export type Trigger = "every_message" | "on_join" | { every: number };

export type ReplyCondition =
	| "always"
	| string
	| { type: "llm"; prompt: string };

export type AgentConfig = {
	id: string;
	model: string;
	system: string;
	/** Lucide icon name or image path/URL */
	avatar?: string;
	sendFirstMessage?: boolean;
	trigger?: Trigger | Trigger[];
	replyCondition?: ReplyCondition | ReplyCondition[];
	guardrails?: boolean;
	reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
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
	| { type: "done"; fullText: string };

export type Provider = "openai" | "anthropic";

export type StreamAgentOptions = {
	credentials?: ResolvedLlmCredentials;
	signal?: AbortSignal;
	tools?: ToolSet;
};

// Model calls per agent turn, counting each round of tool calls
const MAX_STEPS = 8;
const MAX_OUTPUT_TOKENS = 16_000;

export function inferProvider(model: string): Provider {
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

function getModel(
	agent: AgentConfig,
	credentials?: ResolvedLlmCredentials,
): LanguageModel {
	const provider = inferProvider(agent.model);
	const apiKey = getApiKey(provider, agent.model, credentials);
	return provider === "anthropic"
		? createAnthropic({ apiKey })(agent.model)
		: createOpenAI({ apiKey }).responses(agent.model);
}

export async function* streamAgentResponse(
	agent: AgentConfig,
	history: ChatMessage[],
	options: StreamAgentOptions = {},
): AsyncGenerator<StreamDelta> {
	const result = streamText({
		model: getModel(agent, options.credentials),
		system: agent.system,
		messages: history,
		tools: options.tools,
		stopWhen: stepCountIs(MAX_STEPS),
		maxOutputTokens: MAX_OUTPUT_TOKENS,
		abortSignal: options.signal,
		...(agent.reasoningEffort && {
			providerOptions: { openai: { reasoningEffort: agent.reasoningEffort } },
		}),
	});

	let fullText = "";
	// Text from separate steps (before and after tool calls) becomes paragraphs.
	let newStep = false;
	for await (const part of result.fullStream) {
		if (part.type === "start-step") {
			newStep = fullText.length > 0;
		} else if (part.type === "text-delta" && part.text) {
			const text = newStep ? `\n\n${part.text}` : part.text;
			newStep = false;
			fullText += text;
			yield { type: "text_delta", text };
		} else if (part.type === "error") {
			throw part.error;
		}
	}

	yield { type: "done", fullText };
}
