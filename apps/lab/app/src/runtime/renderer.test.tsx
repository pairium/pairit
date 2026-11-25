// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import "./index";
import { PageRenderer } from "./renderer";
import type { Page } from "./types";

afterEach(cleanup);

describe("PageRenderer split layout", () => {
	test("stretches html embeds to fill the split column", () => {
		const page: Page = {
			id: "review",
			layout: "split",
			components: [
				{
					type: "html",
					column: "left",
					props: { html: "<p>hello</p>", height: 320 },
				},
			],
		};

		const { container } = render(
			<PageRenderer page={page} onAction={vi.fn()} />,
		);

		const htmlWrapper = container.querySelector("[data-html]");
		expect(htmlWrapper).toBeTruthy();
		expect(htmlWrapper?.className).toContain("flex-col");

		const column = htmlWrapper?.parentElement;
		expect(column?.className).toContain("[&>[data-html]]:flex-1");
		expect(column?.className).toContain("[&>[data-html]:last-child]:-mb-4");
		expect(column?.className).toContain("[&>[data-html]_iframe]:h-auto");
		expect(column?.className).toContain("[&>[data-html]_iframe]:flex-1");

		const iframe = htmlWrapper?.querySelector("iframe");
		expect(iframe).toBeTruthy();
		expect(iframe?.style.height).toBe("");
		expect(iframe?.style.getPropertyValue("--embed-height")).toBe("320px");
	});

	test("uses full viewport height by default and respects custom page.height", () => {
		const baseSplit: Page = {
			id: "split-no-bottom",
			layout: "split",
			components: [
				{ type: "html", column: "left", props: { html: "<p>left</p>" } },
				{ type: "html", column: "right", props: { html: "<p>right</p>" } },
			],
		};

		const { container, rerender } = render(
			<PageRenderer page={baseSplit} onAction={vi.fn()} />,
		);
		expect(container.querySelector(".max-w-7xl")).toBeTruthy();
		const grid = container.querySelector(".grid") as HTMLElement;
		expect(grid.className).toContain("h-[calc(100vh-6.5rem)]");

		// With bottom buttons, leaves room for the button row
		rerender(
			<PageRenderer
				page={{
					...baseSplit,
					id: "split-with-bottom",
					components: [
						...(baseSplit.components ?? []),
						{
							type: "buttons",
							props: {
								buttons: [
									{
										id: "next",
										text: "Next",
										action: { type: "go_to", target: "done" },
									},
								],
							},
						},
					],
				}}
				onAction={vi.fn()}
			/>,
		);
		const gridWithBottom = container.querySelector(".grid") as HTMLElement;
		expect(gridWithBottom.className).toContain("h-[calc(100vh-10rem)]");

		// Explicit page.height overrides the viewport cap
		rerender(
			<PageRenderer
				page={{ ...baseSplit, id: "split-custom-height", height: 960 }}
				onAction={vi.fn()}
			/>,
		);
		const customGrid = container.querySelector(".grid") as HTMLElement;
		expect(customGrid.className).toContain("h-(--split-height)");
		expect(customGrid.style.getPropertyValue("--split-height")).toBe("960px");
	});
});

describe("PageRenderer page width", () => {
	test("defaults to max-w-3xl and expands to max-w-5xl when width is wide", () => {
		const basePage: Page = {
			id: "intro",
			components: [{ type: "text", props: { text: "Hello" } }],
		};

		const { container, rerender } = render(
			<PageRenderer page={basePage} onAction={vi.fn()} />,
		);
		const defaultCard = container.querySelector(".max-w-3xl");
		expect(defaultCard).toBeTruthy();

		rerender(
			<PageRenderer
				page={{ ...basePage, id: "wide-page", width: "wide" }}
				onAction={vi.fn()}
			/>,
		);
		expect(container.querySelector(".max-w-5xl")).toBeTruthy();
		expect(container.querySelector(".max-w-3xl")).toBeNull();
	});
});
