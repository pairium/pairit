/**
 * Workspace file tools for agents
 * Each model gets the file-editing tool it was trained on: Claude's text
 * editor, OpenAI's apply_patch, or plain read/edit/write tools for the rest.
 * The "file" is a name: nothing is on disk. Every call reads the live doc or
 * goes through applyEdit, so participants' typing is never overwritten.
 */

import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { jsonSchema, type ToolSet, tool } from "ai";
import { getEventsCollection } from "./db";
import { inferProvider } from "./llm";
import { editWorkspace, readWorkspace, type Workspace } from "./workspace";
import { EditError, type WorkspaceEdit } from "./workspace-edit";

export type WorkspaceToolContext = {
	workspace: Workspace;
	agentId: string;
	model: string;
	canEdit: boolean;
	sessionId: string;
	configId: string;
};

/** The one path agents may use. */
export function workspaceFileName(workspace: Workspace): string {
	return workspace.settings.mode === "freeform"
		? "workspace.md"
		: "fields.json";
}

/** The system prompt line that replaces a pasted copy of the doc. */
export function workspacePromptLine(context: WorkspaceToolContext): string {
	const file = workspaceFileName(context.workspace);
	const length = readWorkspace(context.workspace).text.length;
	const access = context.canEdit
		? "View it before you edit it, and edit it with your file tools."
		: "You can view it but not edit it.";
	return `You share a file, ${file} (${length} characters), with the participants. ${access} Participants may edit it while you work, so view it again if an edit is refused.`;
}

/** OpenAI models trained on apply_patch: GPT-5.1 and later. */
function usesApplyPatch(model: string): boolean {
	return (
		inferProvider(model) === "openai" && /^gpt-(5\.[1-9]|[6-9])/.test(model)
	);
}

export function buildWorkspaceTools(context: WorkspaceToolContext): ToolSet {
	const file = new WorkspaceFile(context);
	const provider = inferProvider(context.model);

	if (provider === "anthropic") {
		return {
			str_replace_based_edit_tool: anthropic.tools.textEditor_20250728({
				execute: async (input) =>
					file.run("str_replace_based_edit_tool", input, () => {
						file.checkPath(input.path);
						if (input.command === "view") return file.view(input.view_range);
						file.checkCanEdit();
						switch (input.command) {
							case "str_replace":
								return file.replace(input.old_str ?? "", input.new_str ?? "");
							case "insert":
								return file.insert(
									input.insert_line ?? 0,
									input.insert_text ?? input.new_str ?? "",
								);
							case "create":
								return file.write(input.file_text ?? "");
						}
					}),
			}),
		};
	}

	const readTool = tool({
		description: `Read ${workspaceFileName(context.workspace)}, the file you share with the participants, with line numbers.`,
		inputSchema: jsonSchema<{ view_range?: [number, number] }>({
			type: "object",
			properties: {
				view_range: {
					type: "array",
					items: { type: "integer" },
					description:
						"Optional [start, end] lines, 1-indexed; -1 means the end",
				},
			},
		}),
		execute: async (input) =>
			file.run("read_workspace", input, () => file.view(input.view_range)),
	});

	if (!context.canEdit) return { read_workspace: readTool };

	if (usesApplyPatch(context.model)) {
		return {
			read_workspace: readTool,
			apply_patch: openai.tools.applyPatch({
				execute: async ({ operation }) => {
					const output = await file.run("apply_patch", operation, () => {
						file.checkPath(operation.path);
						if (operation.type === "delete_file") {
							throw new EditError("The shared file can't be deleted.");
						}
						return operation.type === "create_file"
							? file.write(addedLines(operation.diff))
							: file.patch(operation.diff);
					});
					return {
						status: output.startsWith("Error:") ? "failed" : "completed",
						output,
					};
				},
			}),
		};
	}

	return {
		read_workspace: readTool,
		edit_workspace: tool({
			description: `Replace text in ${workspaceFileName(context.workspace)}. old_string must match the current text exactly, once, unless replace_all is true. View the file first.`,
			inputSchema: jsonSchema<{
				old_string: string;
				new_string: string;
				replace_all?: boolean;
			}>({
				type: "object",
				properties: {
					old_string: { type: "string" },
					new_string: { type: "string" },
					replace_all: { type: "boolean" },
				},
				required: ["old_string", "new_string"],
			}),
			execute: async (input) =>
				file.run("edit_workspace", input, () =>
					file.replace(input.old_string, input.new_string, input.replace_all),
				),
		}),
		write_workspace: tool({
			description: `Replace all of ${workspaceFileName(context.workspace)}. Only works if the file is empty or unchanged since you last read it; prefer edit_workspace.`,
			inputSchema: jsonSchema<{ content: string }>({
				type: "object",
				properties: { content: { type: "string" } },
				required: ["content"],
			}),
			execute: async (input) =>
				file.run("write_workspace", input, () => file.write(input.content)),
		}),
	};
}

/**
 * One agent turn's view of the shared file. Remembers what the agent last
 * viewed, which guards whole-file writes.
 */
class WorkspaceFile {
	private lastViewed: string | null = null;

	constructor(private readonly context: WorkspaceToolContext) {}

	private get name(): string {
		return workspaceFileName(this.context.workspace);
	}

	private get origin(): string {
		return `agent:${this.context.agentId}`;
	}

	private get structured(): boolean {
		return this.context.workspace.settings.mode === "structured";
	}

	/** Run an operation, turn refusals into "Error: ..." results, and log it. */
	async run(
		toolName: string,
		args: unknown,
		operation: () => string | Promise<string> | undefined,
	): Promise<string> {
		let result: string;
		try {
			result = (await operation()) ?? "Error: Unknown command.";
		} catch (error) {
			if (!(error instanceof EditError)) throw error;
			result = `Error: ${error.message}`;
		}
		await this.log(toolName, args, result);
		return result;
	}

	checkPath(path: string): void {
		const normalized = path.replace(/^\.?\/+/, "");
		if (normalized !== this.name) {
			throw new EditError(
				`There is one file, ${this.name}. Use that path instead of "${path}".`,
			);
		}
	}

	checkCanEdit(): void {
		if (!this.context.canEdit) {
			throw new EditError(`${this.name} is read-only for you.`);
		}
	}

	view(range?: number[]): string {
		const { text } = readWorkspace(this.context.workspace);
		this.lastViewed = text;
		if (text === "") return `${this.name} is empty.`;
		const lines = text.split("\n");
		const start = Math.max(1, range?.[0] ?? 1);
		const end =
			range?.[1] === undefined || range[1] === -1
				? lines.length
				: Math.min(lines.length, range[1]);
		const width = String(end).length;
		return lines
			.slice(start - 1, end)
			.map((line, i) => `${String(start + i).padStart(width)}\t${line}`)
			.join("\n");
	}

	async replace(
		oldText: string,
		newText: string,
		replaceAll = false,
	): Promise<string> {
		if (this.structured) {
			return this.writeJson(
				replaceOnce(
					readWorkspace(this.context.workspace).text,
					oldText,
					newText,
					replaceAll,
				),
			);
		}
		await this.edit({
			kind: "replace",
			old: oldText,
			new: newText,
			replaceAll,
		});
		return `Edited ${this.name}.`;
	}

	insert(line: number, text: string): Promise<string> {
		const current = readWorkspace(this.context.workspace).text;
		const lines = current === "" ? [] : current.split("\n");
		if (line < 0 || line > lines.length) {
			throw new EditError(
				`insert_line must be between 0 and ${lines.length}, the number of lines.`,
			);
		}
		lines.splice(line, 0, ...text.split("\n"));
		return this.writeFrom(lines.join("\n"));
	}

	/** Replace the whole file; only if empty or unchanged since the last view. */
	write(content: string): Promise<string> {
		const current = readWorkspace(this.context.workspace).text;
		if (current.trim() !== "" && current !== this.lastViewed) {
			throw new EditError(
				`${this.name} has changed since you last viewed it, or you haven't viewed it. View it, then make targeted edits.`,
			);
		}
		return this.writeFrom(content);
	}

	/** Apply an apply_patch update_file diff to the current text. */
	patch(diff: string): Promise<string> {
		const current = readWorkspace(this.context.workspace).text;
		let text = current;
		for (const [i, hunk] of parsePatch(diff).entries()) {
			try {
				text = replaceOnce(text, hunk.old, hunk.new);
			} catch (error) {
				if (error instanceof EditError) {
					throw new EditError(`Hunk ${i + 1}: ${error.message}`);
				}
				throw error;
			}
		}
		return this.writeFrom(text);
	}

	/** Write `next`, computed from the live text. */
	private async writeFrom(next: string): Promise<string> {
		if (this.structured) return this.writeJson(next);
		await this.edit({ kind: "write", content: next });
		return `Edited ${this.name}.`;
	}

	private async writeJson(text: string): Promise<string> {
		let fields: unknown;
		try {
			fields = JSON.parse(text);
		} catch (error) {
			throw new EditError(
				`${this.name} would not be valid JSON (${(error as Error).message}). Nothing was changed.`,
			);
		}
		if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
			throw new EditError(
				`${this.name} must be a JSON object of field values.`,
			);
		}
		await this.edit({
			kind: "fields",
			fields: fields as Record<string, unknown>,
		});
		return `Edited ${this.name}.`;
	}

	private async edit(edit: WorkspaceEdit): Promise<void> {
		// Made against the live doc, so `base` is the doc as it is now.
		const { text, base } = readWorkspace(this.context.workspace);
		await editWorkspace(this.context.workspace, edit, this.origin, base);
		// The agent knows the result of its own edit; it hasn't missed anything.
		if (this.lastViewed === text) {
			this.lastViewed = readWorkspace(this.context.workspace).text;
		}
	}

	private async log(toolName: string, args: unknown, result: string) {
		try {
			const events = await getEventsCollection();
			const now = new Date();
			await events.insertOne({
				type: "workspace_tool",
				timestamp: now.toISOString(),
				sessionId: this.context.sessionId,
				configId: this.context.configId,
				pageId: this.context.workspace.pageId,
				componentType: "live-workspace",
				componentId: "",
				data: {
					agentId: this.context.agentId,
					workspaceId: this.context.workspace.id,
					tool: toolName,
					args,
					result: result.slice(0, 2_000),
				},
				idempotencyKey: `wstool-${now.getTime()}-${Math.random().toString(36).slice(2)}`,
				createdAt: now,
			});
		} catch (error) {
			console.error("[Workspace] Failed to log tool call:", error);
		}
	}
}

/** Replace text that must appear exactly once (or every time, with all). */
export function replaceOnce(
	text: string,
	oldText: string,
	newText: string,
	all = false,
): string {
	if (oldText === "") {
		throw new EditError(
			"The text to replace is empty. Quote the text to replace.",
		);
	}
	const count = text.split(oldText).length - 1;
	if (count === 0) {
		throw new EditError(
			"The text to replace was not found. The file may have changed; view it again.",
		);
	}
	if (count > 1 && !all) {
		throw new EditError(
			`The text to replace matches ${count} times. Add surrounding lines to make it unique.`,
		);
	}
	return text.split(oldText).join(newText);
}

/**
 * Parse an apply_patch update diff into find/replace pairs. Each hunk starts
 * at a line beginning "@@"; " " lines are context, "-" removed, "+" added.
 */
export function parsePatch(diff: string): Array<{ old: string; new: string }> {
	const hunks: Array<{ old: string[]; new: string[] }> = [];
	let hunk: { old: string[]; new: string[] } | null = null;
	for (const line of diff.split("\n")) {
		if (line.startsWith("@@")) {
			hunk = { old: [], new: [] };
			hunks.push(hunk);
			continue;
		}
		if (line.startsWith("***")) continue;
		const marker = line[0];
		if (marker !== " " && marker !== "-" && marker !== "+") continue;
		if (!hunk) {
			hunk = { old: [], new: [] };
			hunks.push(hunk);
		}
		if (marker !== "+") hunk.old.push(line.slice(1));
		if (marker !== "-") hunk.new.push(line.slice(1));
	}
	const parsed = hunks
		.filter((h) => h.old.length > 0 || h.new.length > 0)
		.map((h) => ({ old: h.old.join("\n"), new: h.new.join("\n") }));
	if (parsed.length === 0) {
		throw new EditError("The patch has no changes.");
	}
	for (const h of parsed) {
		if (h.old === "") {
			throw new EditError(
				"Each hunk needs at least one context or removed line to place it.",
			);
		}
	}
	return parsed;
}

/** A create_file diff is all "+" lines. */
function addedLines(diff: string): string {
	return diff
		.split("\n")
		.filter((line) => line.startsWith("+"))
		.map((line) => line.slice(1))
		.join("\n");
}
