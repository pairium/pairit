// @vitest-environment jsdom

import { fireEvent, render } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { HtmlEmbed } from "./HtmlEmbed";

describe("HtmlEmbed", () => {
	test("runs onLoad only for the first load of each srcdoc", () => {
		const onLoad = vi.fn();
		const onNavigateAway = vi.fn();
		const { container, rerender } = render(
			<HtmlEmbed
				srcdoc="<p>a</p>"
				height={100}
				onLoad={onLoad}
				onNavigateAway={onNavigateAway}
			/>,
		);
		const iframe = container.querySelector("iframe") as HTMLIFrameElement;
		expect(iframe.getAttribute("sandbox")).toBe("allow-scripts");
		expect(iframe.style.getPropertyValue("--embed-height")).toBe("100px");
		expect(iframe.className).toContain("h-(--embed-height)");

		fireEvent.load(iframe);
		expect(onLoad).toHaveBeenCalledTimes(1);
		expect(onNavigateAway).not.toHaveBeenCalled();

		// The page navigated itself somewhere else
		fireEvent.load(iframe);
		expect(onLoad).toHaveBeenCalledTimes(1);
		expect(onNavigateAway).toHaveBeenCalledTimes(1);

		// A new document from the lab counts as a first load again
		rerender(
			<HtmlEmbed
				srcdoc="<p>b</p>"
				height={100}
				onLoad={onLoad}
				onNavigateAway={onNavigateAway}
			/>,
		);
		fireEvent.load(iframe);
		expect(onLoad).toHaveBeenCalledTimes(2);
	});
});
