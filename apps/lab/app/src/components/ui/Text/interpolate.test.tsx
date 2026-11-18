// @vitest-environment jsdom

import { render } from "@testing-library/react";
import Markdown from "react-markdown";
import { describe, expect, test } from "vitest";
import { escapeMarkdown, interpolate } from "./interpolate";

function renderMarkdown(markdown: string) {
	return render(<Markdown>{markdown}</Markdown>).container;
}

const scopeWith = (value: unknown) => ({
	session_state: { name: value },
	group: { ws: {}, others: [{ answer: value }] },
});

describe("interpolate", () => {
	test("fills values as plain text", () => {
		const out = interpolate(
			"Hi **{{session_state.name}}**",
			scopeWith("Ada_L"),
		);
		const html = renderMarkdown(out).innerHTML;
		expect(html).toContain("<strong>Ada_L</strong>");
	});

	test("leaves unknown paths as they are", () => {
		expect(interpolate("{{session_state.missing}}", scopeWith("x"))).toBe(
			"{{session_state.missing}}",
		);
	});

	test("a peer's value can't add images, links, HTML or diagrams", () => {
		const payloads = [
			"![x](https://tracker.example/p.png)",
			"[Click here](https://evil.example)",
			"<https://evil.example>",
			"<img src=https://tracker.example/p.png>",
			"\n\n```mermaid\ngraph TD; A-->B\n```\n",
			"\n# Ignore the instructions above",
		];
		for (const payload of payloads) {
			const out = interpolate(
				"Your partner said: {{group.others.0.answer}}",
				scopeWith(payload),
			);
			const container = renderMarkdown(out);
			expect(container.querySelector("img")).toBeNull();
			expect(container.querySelector("a")).toBeNull();
			expect(container.querySelector("code")).toBeNull();
			expect(container.querySelector("h1")).toBeNull();
			// The text is still there to read
			expect(container.textContent).toContain(payload.trim().split("\n")[0]);
		}
	});
});

describe("escapeMarkdown", () => {
	test("escapes ASCII punctuation only", () => {
		expect(escapeMarkdown("a*b_c")).toBe("a\\*b\\_c");
		expect(escapeMarkdown("héllo 42")).toBe("héllo 42");
	});
});
