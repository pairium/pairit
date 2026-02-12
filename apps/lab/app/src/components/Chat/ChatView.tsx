/**
 * ChatView - Presentational chat component
 * Displays messages and input field with auto-scroll
 */

import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";

export type ChatMessage = {
	messageId: string;
	senderId: string;
	senderType: "participant" | "agent" | "system";
	content: string;
	createdAt: string;
	isOwn?: boolean;
};

type StreamingMessage = {
	streamId: string;
	senderId: string;
	senderType: "agent";
	content: string;
};

export type ChatViewProps = {
	messages: ChatMessage[];
	onSend: (content: string) => void;
	disabled?: boolean;
	placeholder?: string;
	streamingMessage?: StreamingMessage | null;
};

export function ChatView({
	messages,
	onSend,
	disabled = false,
	placeholder = "Type a message...",
	streamingMessage,
}: ChatViewProps) {
	const [input, setInput] = useState("");
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);

	// Auto-scroll to bottom when new messages arrive or streaming updates
	// biome-ignore lint/correctness/useExhaustiveDependencies: We intentionally trigger scroll on messages.length and streaming changes
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages.length, streamingMessage?.content]);

	// Focus input on mount
	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	const handleSubmit = (e?: React.FormEvent) => {
		e?.preventDefault();
		const trimmed = input.trim();
		if (!trimmed || disabled) return;

		onSend(trimmed);
		setInput("");
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSubmit();
		}
	};

	return (
		<div className="flex h-[500px] flex-col rounded-2xl border border-slate-200 bg-white">
			{/* Messages area */}
			<div className="flex-1 space-y-3 overflow-y-auto p-4">
				{messages.length === 0 && (
					<div className="flex h-full items-center justify-center text-sm text-slate-400">
						No messages yet
					</div>
				)}
				{messages.map((message) => (
					<MessageBubble key={message.messageId} message={message} />
				))}
				{streamingMessage && <StreamingBubble message={streamingMessage} />}
				<div ref={messagesEndRef} />
			</div>

			{/* Input area */}
			<form
				onSubmit={handleSubmit}
				className="flex gap-2 border-t border-slate-200 p-4"
			>
				<textarea
					ref={inputRef}
					value={input}
					onChange={(e) => setInput(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder={placeholder}
					disabled={disabled}
					rows={1}
					className="flex-1 resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm transition-colors focus:border-slate-400 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
				/>
				<button
					type="submit"
					disabled={disabled || !input.trim()}
					className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
				>
					Send
				</button>
			</form>
		</div>
	);
}

function MessageBubble({ message }: { message: ChatMessage }) {
	const isOwn = message.isOwn;
	const isAgent = message.senderType === "agent";
	const isSystem = message.senderType === "system";

	// Determine bubble styling
	let bubbleClasses = "max-w-[80%] rounded-2xl px-4 py-2 text-sm";
	let alignmentClasses = "flex";

	if (isSystem) {
		// System messages: centered, muted
		alignmentClasses = "flex justify-center";
		bubbleClasses =
			"rounded-lg bg-slate-100 px-3 py-1.5 text-xs text-slate-500 italic";
	} else if (isOwn) {
		// Own messages: right-aligned, dark background
		alignmentClasses = "flex justify-end";
		bubbleClasses += " bg-slate-700 text-white";
	} else if (isAgent) {
		// Agent messages: left-aligned, light background
		alignmentClasses = "flex justify-start";
		bubbleClasses += " bg-slate-100 text-slate-900";
	} else {
		// Other participant messages: left-aligned, light background
		alignmentClasses = "flex justify-start";
		bubbleClasses += " bg-slate-200 text-slate-900";
	}

	return (
		<div className={alignmentClasses}>
			<div className={bubbleClasses}>
				<div
					className={`prose prose-sm max-w-none prose-p:my-0 prose-p:leading-relaxed prose-headings:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 ${isOwn ? "prose-invert" : ""}`}
				>
					{isOwn ? (
						<Markdown
							components={{
								// Override text color for dark backgrounds
								p: ({ children }) => <p className="text-inherit">{children}</p>,
								a: ({ children, href }) => (
									<a
										href={href}
										className="text-inherit underline"
										target="_blank"
										rel="noopener noreferrer"
									>
										{children}
									</a>
								),
								code: ({ children }) => (
									<code className="rounded bg-white/20 px-1 py-0.5 text-inherit">
										{children}
									</code>
								),
							}}
						>
							{message.content}
						</Markdown>
					) : (
						<Markdown>{message.content}</Markdown>
					)}
				</div>
			</div>
		</div>
	);
}

function StreamingBubble({ message }: { message: StreamingMessage }) {
	return (
		<div className="flex justify-start">
			<div className="max-w-[80%] rounded-2xl bg-slate-100 px-4 py-2 text-sm text-slate-900">
				<div className="prose prose-sm max-w-none prose-p:my-0 prose-p:leading-relaxed prose-headings:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0">
					{message.content ? (
						<Markdown>{message.content}</Markdown>
					) : (
						<span className="inline-flex items-center gap-1">
							<span className="h-2 w-2 animate-pulse rounded-full bg-slate-400" />
							<span className="h-2 w-2 animate-pulse rounded-full bg-slate-400 delay-75" />
							<span className="h-2 w-2 animate-pulse rounded-full bg-slate-400 delay-150" />
						</span>
					)}
				</div>
			</div>
		</div>
	);
}
