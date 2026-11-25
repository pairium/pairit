// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import "@app/runtime";
import { submitEvent, updateState } from "@app/lib/api";
import { PageRenderer } from "@app/runtime/renderer";
import type { Page } from "@app/runtime/types";

vi.mock("@app/lib/api", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@app/lib/api")>();
	return {
		...actual,
		updateState: vi.fn(),
		submitEvent: vi.fn(),
	};
});

const updateStateMock = vi.mocked(updateState);
const submitEventMock = vi.mocked(submitEvent);

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

function sendFromIframe(iframe: HTMLIFrameElement, data: unknown) {
	window.dispatchEvent(
		new MessageEvent("message", {
			data,
			origin: "null",
			source: iframe.contentWindow,
		}),
	);
}

describe("HtmlRuntime", () => {
	beforeEach(() => {
		updateStateMock.mockReset();
		submitEventMock.mockReset();
		updateStateMock.mockResolvedValue(undefined);
		submitEventMock.mockResolvedValue({ eventId: "evt-1" });
	});

	afterEach(cleanup);

	test("auto-sizes when height is omitted or 'auto', and clamps oversized values", async () => {
		const page: Page = {
			id: "task",
			components: [
				{
					type: "html",
					id: "embed",
					props: { html: "<p>hello</p>", borderless: true },
				},
			],
		};

		const { container } = render(
			<PageRenderer page={page} onAction={vi.fn()} />,
		);
		const iframe = container.querySelector("iframe") as HTMLIFrameElement;
		expect(iframe.style.getPropertyValue("--embed-height")).toBe("400px");
		expect(iframe.className).toContain("border-0");
		expect(iframe.className).not.toContain("border-slate-200");

		sendFromIframe(iframe, { type: "pairit:resize", height: 612.3 });
		await waitFor(() => {
			expect(iframe.style.getPropertyValue("--embed-height")).toBe("613px");
		});

		// Shrinks cleanly when content gets shorter
		sendFromIframe(iframe, { type: "pairit:resize", height: 240 });
		await waitFor(() => {
			expect(iframe.style.getPropertyValue("--embed-height")).toBe("240px");
		});

		// Clamps huge heights
		sendFromIframe(iframe, { type: "pairit:resize", height: 999_999 });
		await waitFor(() => {
			expect(iframe.style.getPropertyValue("--embed-height")).toBe("10000px");
		});
	});

	test("keeps fixed numeric height and ignores resize messages", async () => {
		const page: Page = {
			id: "task",
			components: [
				{
					type: "html",
					id: "embed",
					props: { html: "<p>hello</p>", height: 320 },
				},
			],
		};

		const { container } = render(
			<PageRenderer page={page} onAction={vi.fn()} />,
		);
		const iframe = container.querySelector("iframe") as HTMLIFrameElement;
		expect(iframe.style.getPropertyValue("--embed-height")).toBe("320px");

		sendFromIframe(iframe, { type: "pairit:resize", height: 700 });
		await Promise.resolve();
		expect(iframe.style.getPropertyValue("--embed-height")).toBe("320px");
	});

	test("flushes pending setState writes and onDone before running props.action on pairit.done()", async () => {
		const pendingState = deferred<void>();
		updateStateMock.mockReturnValueOnce(pendingState.promise);
		const onAction = vi.fn();
		const onSessionStateChange = vi.fn();

		const page: Page = {
			id: "practice",
			components: [
				{
					type: "html",
					id: "workspace",
					props: {
						html: "<p>task</p>",
						write: ["score"],
						required: true,
						action: {
							type: "go_to",
							branches: [
								{ when: "session_state.score >= 3", target: "rules" },
								{ target: "retry" },
							],
						},
					},
				},
			],
		};

		const { container } = render(
			<PageRenderer
				page={page}
				sessionId="sess-1"
				sessionState={{}}
				onSessionStateChange={onSessionStateChange}
				onAction={onAction}
			/>,
		);
		const iframe = container.querySelector("iframe") as HTMLIFrameElement;

		sendFromIframe(iframe, {
			type: "pairit:setState",
			data: { score: 4, extra: "dropped" },
		});
		sendFromIframe(iframe, { type: "pairit:done" });
		// A rapid second done while the first is flushing is ignored
		sendFromIframe(iframe, { type: "pairit:done" });

		expect(updateStateMock).toHaveBeenCalledWith("sess-1", { score: 4 });
		expect(onSessionStateChange).toHaveBeenCalledWith({ score: 4 });

		// Navigation must wait until the state write completes
		await Promise.resolve();
		expect(onAction).not.toHaveBeenCalled();

		pendingState.resolve(undefined);

		await waitFor(() => {
			expect(onAction).toHaveBeenCalledTimes(1);
		});
		expect(onAction).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "go_to",
				target: "rules",
			}),
		);
	});
});
