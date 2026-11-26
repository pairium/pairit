// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const {
	startTimerMock,
	submitEventMock,
	updateStateMock,
	sseHandlers,
	emitSse,
} = vi.hoisted(() => {
	const handlers = new Map<string, Set<(data: unknown) => void>>();
	return {
		startTimerMock: vi.fn(),
		submitEventMock: vi.fn().mockResolvedValue({ eventId: "e1" }),
		updateStateMock: vi.fn().mockResolvedValue(undefined),
		sseHandlers: handlers,
		emitSse(event: string, data: unknown) {
			for (const handler of handlers.get(event) ?? []) {
				handler(data);
			}
		},
	};
});

vi.mock("@app/lib/api", () => ({
	startTimer: startTimerMock,
	submitEvent: submitEventMock,
	updateState: updateStateMock,
}));

vi.mock("@app/lib/sse", () => ({
	sseClient: {
		on(event: string, handler: (data: unknown) => void) {
			let set = sseHandlers.get(event);
			if (!set) {
				set = new Set();
				sseHandlers.set(event, set);
			}
			set.add(handler);
			return () => {
				set?.delete(handler);
			};
		},
	},
}));

import { TimerRuntime } from "./runtime";

function setDocumentHidden(hidden: boolean) {
	Object.defineProperty(document, "hidden", {
		configurable: true,
		get: () => hidden,
	});
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-11-25T20:00:00.000Z"));
	startTimerMock.mockReset();
	submitEventMock.mockClear();
	updateStateMock.mockClear();
	sseHandlers.clear();
	setDocumentHidden(false);
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

describe("TimerRuntime", () => {
	test("syncs remaining time from server expiresAt and serverNow", async () => {
		const serverNow = 10_000_000;
		startTimerMock.mockResolvedValue({
			timerKey: "page:draft:timer-0",
			startedAt: serverNow - 30_000,
			expiresAt: serverNow + 90_000,
			serverNow,
			duration: 120,
			scope: "group",
		});

		const onAction = vi.fn();
		const Renderer = TimerRuntime.renderer;
		render(
			<Renderer
				component={{
					type: "timer",
					id: "timer-0",
					props: {
						duration: 120,
						scope: "group",
						action: { type: "go_to", target: "next" },
					},
				}}
				context={{
					onAction,
					registerNavigationGuard: () => () => {},
					sessionId: "s1",
					pageId: "draft",
				}}
			/>,
		);

		await act(async () => {
			await Promise.resolve();
		});

		expect(startTimerMock).toHaveBeenCalledWith("s1", {
			pageId: "draft",
			componentId: "timer-0",
		});
		expect(screen.getByText("1:30")).toBeTruthy();
		expect(onAction).not.toHaveBeenCalled();
	});

	test("expires immediately on SSE timer_expired even when document is hidden", async () => {
		const serverNow = Date.now();
		startTimerMock.mockResolvedValue({
			timerKey: "page:synthesis:timer-0",
			startedAt: serverNow,
			expiresAt: serverNow + 60_000,
			serverNow,
			duration: 60,
			scope: "group",
		});

		const onAction = vi.fn();
		const onSessionStateChange = vi.fn();
		const Renderer = TimerRuntime.renderer;
		render(
			<Renderer
				component={{
					type: "timer",
					id: "timer-0",
					props: {
						duration: 60,
						scope: "group",
						action: {
							type: "go_to",
							target: "debrief",
							setState: { timed_out: true },
						},
					},
				}}
				context={{
					onAction,
					registerNavigationGuard: () => () => {},
					sessionId: "s1",
					pageId: "synthesis",
					onSessionStateChange,
				}}
			/>,
		);

		await act(async () => {
			await Promise.resolve();
		});

		setDocumentHidden(true);

		await act(async () => {
			emitSse("timer_expired", {
				timerKey: "page:synthesis:timer-0",
				expiresAt: serverNow + 60_000,
			});
			await Promise.resolve();
		});

		expect(updateStateMock).toHaveBeenCalledWith("s1", { timed_out: true });
		expect(onSessionStateChange).toHaveBeenCalledWith({ timed_out: true });
		// Hidden tab advances immediately without waiting on a throttled setTimeout
		expect(onAction).toHaveBeenCalledWith({
			type: "go_to",
			target: "debrief",
			setState: { timed_out: true },
		});
	});

	test("expires immediately on visibilitychange if deadline passed while hidden", async () => {
		const now = Date.now();
		startTimerMock.mockResolvedValue({
			timerKey: "page:draft:timer-0",
			startedAt: now,
			expiresAt: now + 30_000,
			serverNow: now,
			duration: 30,
			scope: "session",
		});

		const onAction = vi.fn();
		const Renderer = TimerRuntime.renderer;
		render(
			<Renderer
				component={{
					type: "timer",
					id: "timer-0",
					props: {
						duration: 30,
						action: { type: "go_to", target: "next" },
					},
				}}
				context={{
					onAction,
					registerNavigationGuard: () => () => {},
					sessionId: "s1",
					pageId: "draft",
				}}
			/>,
		);

		await act(async () => {
			await Promise.resolve();
		});

		// Simulate wall clock jumping past expiry without interval ticks firing
		setDocumentHidden(true);
		vi.setSystemTime(now + 45_000);
		setDocumentHidden(false);

		await act(async () => {
			document.dispatchEvent(new Event("visibilitychange"));
			await vi.advanceTimersByTimeAsync(500);
		});

		expect(onAction).toHaveBeenCalledWith({ type: "go_to", target: "next" });
	});

	test("expires immediately if server returns an already-expired deadline", async () => {
		const serverNow = 5_000_000;
		startTimerMock.mockResolvedValue({
			timerKey: "page:draft:timer-0",
			startedAt: serverNow - 120_000,
			expiresAt: serverNow - 5_000,
			serverNow,
			duration: 60,
			scope: "group",
		});

		const onAction = vi.fn();
		const Renderer = TimerRuntime.renderer;
		render(
			<Renderer
				component={{
					type: "timer",
					id: "timer-0",
					props: {
						duration: 60,
						scope: "group",
						action: { type: "go_to", target: "next" },
					},
				}}
				context={{
					onAction,
					registerNavigationGuard: () => () => {},
					sessionId: "s1",
					pageId: "draft",
				}}
			/>,
		);

		await act(async () => {
			await Promise.resolve();
			await vi.advanceTimersByTimeAsync(500);
		});

		expect(onAction).toHaveBeenCalledWith({ type: "go_to", target: "next" });
	});

	test("handles SSE timer_expired arriving before startTimer resolves", async () => {
		startTimerMock.mockReturnValue(new Promise(() => {}));

		const onAction = vi.fn();
		const Renderer = TimerRuntime.renderer;
		setDocumentHidden(true);
		render(
			<Renderer
				component={{
					type: "timer",
					id: "timer-0",
					props: {
						duration: 60,
						scope: "group",
						key: "draft_phase",
						action: { type: "go_to", target: "next" },
					},
				}}
				context={{
					onAction,
					registerNavigationGuard: () => () => {},
					sessionId: "s1",
					pageId: "draft",
				}}
			/>,
		);

		await act(async () => {
			emitSse("timer_expired", {
				timerKey: "key:draft_phase",
				expiresAt: Date.now(),
			});
			await Promise.resolve();
		});

		expect(onAction).toHaveBeenCalledWith({ type: "go_to", target: "next" });
	});

	test("does not restart timer when re-rendered with a new action object reference", async () => {
		const now = Date.now();
		startTimerMock.mockResolvedValue({
			timerKey: "page:draft:timer-0",
			startedAt: now,
			expiresAt: now + 60_000,
			serverNow: now,
			duration: 60,
			scope: "session",
		});

		const onAction = vi.fn();
		const Renderer = TimerRuntime.renderer;
		const { rerender } = render(
			<Renderer
				component={{
					type: "timer",
					id: "timer-0",
					props: {
						duration: 60,
						action: { type: "go_to", target: "next" },
					},
				}}
				context={{
					onAction,
					registerNavigationGuard: () => () => {},
					sessionId: "s1",
					pageId: "draft",
				}}
			/>,
		);

		await act(async () => {
			await Promise.resolve();
		});

		rerender(
			<Renderer
				component={{
					type: "timer",
					id: "timer-0",
					props: {
						duration: 60,
						action: { type: "go_to", target: "next" },
					},
				}}
				context={{
					onAction,
					registerNavigationGuard: () => () => {},
					sessionId: "s1",
					pageId: "draft",
				}}
			/>,
		);

		expect(startTimerMock).toHaveBeenCalledTimes(1);
	});

	test("retries server sync on SSE reconnect after an initial sync failure", async () => {
		const now = Date.now();
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		startTimerMock.mockRejectedValueOnce(new Error("network blip"));
		startTimerMock.mockResolvedValueOnce({
			timerKey: "page:draft:timer-0",
			startedAt: now - 30_000,
			expiresAt: now + 30_000,
			serverNow: now,
			duration: 60,
			scope: "group",
		});

		const Renderer = TimerRuntime.renderer;
		try {
			render(
				<Renderer
					component={{
						type: "timer",
						id: "timer-0",
						props: { duration: 60, scope: "group" },
					}}
					context={{
						onAction: vi.fn(),
						registerNavigationGuard: () => () => {},
						sessionId: "s1",
						pageId: "draft",
					}}
				/>,
			);

			await act(async () => {
				await Promise.resolve();
			});
			expect(screen.getByText("1:00")).toBeTruthy();

			await act(async () => {
				emitSse("connected", { sessionId: "s1" });
				await Promise.resolve();
			});

			expect(startTimerMock).toHaveBeenCalledTimes(2);
			expect(screen.getByText("0:30")).toBeTruthy();
		} finally {
			errorSpy.mockRestore();
		}
	});
});
