// @vitest-environment jsdom

import { render } from "@testing-library/react";
import Markdown from "react-markdown";
import { describe, expect, test } from "vitest";
import { OTHERS_MARKDOWN } from "./markdown";

function renderOthers(content: string) {
	return render(<Markdown components={OTHERS_MARKDOWN}>{content}</Markdown>)
		.container;
}

describe("OTHERS_MARKDOWN", () => {
	test("shows images from others as text", () => {
		const container = renderOthers(
			"look ![a cat](https://tracker.example/p.png) and ![](https://t.example/q.png)",
		);
		expect(container.querySelector("img")).toBeNull();
		expect(container.textContent).toContain("[image: a cat]");
		expect(container.textContent).toContain("[image: https://t.example/q.png]");
	});

	test("opens links in a new tab without a referrer or opener", () => {
		const link = renderOthers("[docs](https://example.com)").querySelector("a");
		expect(link?.getAttribute("href")).toBe("https://example.com");
		expect(link?.getAttribute("target")).toBe("_blank");
		expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
	});
});
