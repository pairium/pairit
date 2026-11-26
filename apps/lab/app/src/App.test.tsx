// @vitest-environment jsdom

import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import App from "./App.tsx";
import {
	AuthRequiredError,
	advance,
	randomize,
	startSession,
	startTimer,
} from "./lib/api";
import type { CompiledConfig } from "./runtime/config";
import type { Page } from "./runtime/types";

vi.mock("./lib/api", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./lib/api")>();
	return {
		...actual,
		startSession: vi.fn(),
		advance: vi.fn(),
		randomize: vi.fn(),
		startTimer: vi.fn(),
		submitEvent: vi.fn().mockResolvedValue({ eventId: "e1" }),
	};
});

vi.mock("./lib/sse", () => ({
	sseClient: {
		connect: vi.fn(),
		disconnect: vi.fn(),
		on: vi.fn(() => () => {}),
	},
}));

vi.mock("./lib/auth-client", () => ({
	useSession: () => ({ data: null, isPending: false, error: null }),
	signIn: { social: vi.fn() },
	signOut: vi.fn(),
}));

const startSessionMock = vi.mocked(startSession);
const advanceMock = vi.mocked(advance);
const randomizeMock = vi.mocked(randomize);
const startTimerMock = vi.mocked(startTimer);

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

const introPage: Page = {
	id: "intro",
	components: [
		{
			type: "text",
			props: { text: "Welcome to the study." },
		},
		{
			type: "buttons",
			props: {
				buttons: [
					{
						id: "next",
						text: "Continue",
						action: { type: "go_to", target: "thanks" },
					},
				],
			},
		},
	],
};

const thanksPage: Page = {
	id: "thanks",
	components: [
		{
			type: "text",
			props: { text: "All done." },
		},
		{
			type: "buttons",
			props: {
				buttons: [
					{
						id: "again",
						text: "Again",
						action: { type: "go_to", target: "intro" },
					},
				],
			},
		},
	],
};

const assignedPage: Page = {
	id: "assigned",
	onEnter: [{ type: "randomize", stateKey: "treatment" }],
	components: [
		{
			type: "text",
			props: { text: "You are assigned." },
		},
	],
};

const endPage: Page = {
	id: "end",
	end: true,
	components: [
		{
			type: "text",
			props: { text: "All done." },
		},
	],
};

const compiledConfig: CompiledConfig = {
	initialPageId: "intro",
	pages: {
		intro: introPage,
		thanks: thanksPage,
		assigned: assignedPage,
		end: endPage,
	},
};

function startOnIntro() {
	startSessionMock.mockResolvedValue({
		sessionId: "sess-1",
		configId: "test-experiment",
		config: compiledConfig,
		currentPageId: "intro",
		page: introPage,
	});
}

function renderApp() {
	const rootRoute = createRootRoute({
		component: Outlet,
	});

	const experimentRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/$experimentId",
		component: App,
	});

	const router = createRouter({
		routeTree: rootRoute.addChildren([experimentRoute]),
		history: createMemoryHistory({
			initialEntries: ["/test-experiment"],
		}),
	});

	return render(<RouterProvider router={router} />);
}

describe("App", () => {
	beforeEach(() => {
		startSessionMock.mockReset();
		advanceMock.mockReset();
		randomizeMock.mockReset();
		startTimerMock.mockReset();
	});

	test("shows a skeleton while the session starts", async () => {
		const pending = deferred<Awaited<ReturnType<typeof startSession>>>();
		startSessionMock.mockReturnValue(pending.promise);

		renderApp();

		expect(
			await screen.findByRole("status", { name: "Loading" }),
		).toBeDefined();
		expect(screen.queryByText("Loading…")).toBeNull();
		expect(screen.queryByText("Welcome to the study.")).toBeNull();
	});

	test("shows the next page before advance resolves", async () => {
		startOnIntro();
		const pendingAdvance = deferred<Awaited<ReturnType<typeof advance>>>();
		advanceMock.mockReturnValue(pendingAdvance.promise);

		renderApp();
		expect(await screen.findByText("Welcome to the study.")).toBeDefined();

		fireEvent.click(screen.getByRole("button", { name: "Continue" }));

		expect(await screen.findByText("All done.")).toBeDefined();
		expect(screen.queryByText("Welcome to the study.")).toBeNull();
		expect(advanceMock).toHaveBeenCalledWith(
			"sess-1",
			"thanks",
			expect.any(String),
		);

		pendingAdvance.resolve({
			sessionId: "sess-1",
			currentPageId: "thanks",
			page: thanksPage,
			endedAt: null,
		});

		expect(await screen.findByText("All done.")).toBeDefined();
	});

	test("retries a failed advance once, then restores the previous page", async () => {
		startOnIntro();
		advanceMock.mockRejectedValue(new Error("Failed to advance"));

		renderApp();
		expect(await screen.findByText("Welcome to the study.")).toBeDefined();

		fireEvent.click(screen.getByRole("button", { name: "Continue" }));

		expect(await screen.findByText("Failed to advance")).toBeDefined();
		expect(screen.getByText("Welcome to the study.")).toBeDefined();
		expect(screen.queryByText("All done.")).toBeNull();
		expect(advanceMock).toHaveBeenCalledTimes(2);
		expect(advanceMock.mock.calls[0]?.[2]).toBe(advanceMock.mock.calls[1]?.[2]);
	});

	test("keeps a page with onEnter hidden until randomize finishes", async () => {
		startOnIntro();
		const introToAssigned: Page = {
			...introPage,
			components: [
				introPage.components?.[0] ?? {
					type: "text",
					props: { text: "Welcome to the study." },
				},
				{
					type: "buttons",
					props: {
						buttons: [
							{
								id: "next",
								text: "Continue",
								action: { type: "go_to", target: "assigned" },
							},
						],
					},
				},
			],
		};
		startSessionMock.mockResolvedValue({
			sessionId: "sess-1",
			configId: "test-experiment",
			config: {
				...compiledConfig,
				pages: { ...compiledConfig.pages, intro: introToAssigned },
			},
			currentPageId: "intro",
			page: introToAssigned,
		});

		const pendingAdvance = deferred<Awaited<ReturnType<typeof advance>>>();
		const pendingRandomize = deferred<Awaited<ReturnType<typeof randomize>>>();
		advanceMock.mockReturnValue(pendingAdvance.promise);
		randomizeMock.mockReturnValue(pendingRandomize.promise);

		renderApp();
		expect(await screen.findByText("Welcome to the study.")).toBeDefined();

		fireEvent.click(screen.getByRole("button", { name: "Continue" }));

		await waitFor(() => {
			expect(advanceMock).toHaveBeenCalledWith("sess-1", "assigned");
		});
		expect(screen.getByText("Welcome to the study.")).toBeDefined();
		expect(screen.queryByText("You are assigned.")).toBeNull();
		expect(screen.getByRole("button", { name: "Continue" })).toHaveProperty(
			"disabled",
			true,
		);

		pendingAdvance.resolve({
			sessionId: "sess-1",
			currentPageId: "assigned",
			page: assignedPage,
			endedAt: null,
		});

		await waitFor(() => {
			expect(randomizeMock).toHaveBeenCalled();
		});
		expect(screen.queryByText("You are assigned.")).toBeNull();

		pendingRandomize.resolve({ condition: "control", existing: false });

		expect(await screen.findByText("You are assigned.")).toBeDefined();
		expect(screen.queryByText("Welcome to the study.")).toBeNull();
	});

	test("waits for the server before showing an end page", async () => {
		const introToEnd: Page = {
			...introPage,
			components: [
				introPage.components?.[0] ?? {
					type: "text",
					props: { text: "Welcome to the study." },
				},
				{
					type: "buttons",
					props: {
						buttons: [
							{
								id: "next",
								text: "Continue",
								action: { type: "go_to", target: "end" },
							},
						],
					},
				},
			],
		};
		startSessionMock.mockResolvedValue({
			sessionId: "sess-1",
			configId: "test-experiment",
			config: {
				...compiledConfig,
				pages: { ...compiledConfig.pages, intro: introToEnd },
			},
			currentPageId: "intro",
			page: introToEnd,
		});

		const pendingAdvance = deferred<Awaited<ReturnType<typeof advance>>>();
		advanceMock.mockReturnValue(pendingAdvance.promise);

		renderApp();
		expect(await screen.findByText("Welcome to the study.")).toBeDefined();

		fireEvent.click(screen.getByRole("button", { name: "Continue" }));

		await waitFor(() => {
			expect(advanceMock).toHaveBeenCalledWith("sess-1", "end");
		});
		expect(screen.getByText("Welcome to the study.")).toBeDefined();
		expect(screen.queryByText("All done.")).toBeNull();

		pendingAdvance.resolve({
			sessionId: "sess-1",
			currentPageId: "end",
			page: endPage,
			endedAt: "2026-09-25T00:00:00.000Z",
		});

		expect(await screen.findByText("All done.")).toBeDefined();
		expect(screen.queryByText("Welcome to the study.")).toBeNull();
		expect(screen.queryByText("Thanks, that's it.")).toBeNull();
		expect(screen.queryByRole("button", { name: /examples/i })).toBeNull();
	});

	test("ignores a second click while advance is in flight", async () => {
		startOnIntro();
		const pendingAdvance = deferred<Awaited<ReturnType<typeof advance>>>();
		advanceMock.mockReturnValue(pendingAdvance.promise);

		renderApp();
		expect(await screen.findByText("Welcome to the study.")).toBeDefined();

		fireEvent.click(screen.getByRole("button", { name: "Continue" }));
		expect(await screen.findByRole("button", { name: "Again" })).toBeDefined();

		fireEvent.click(screen.getByRole("button", { name: "Again" }));

		expect(advanceMock).toHaveBeenCalledTimes(1);

		pendingAdvance.resolve({
			sessionId: "sess-1",
			currentPageId: "thanks",
			page: thanksPage,
			endedAt: null,
		});

		expect(await screen.findByText("All done.")).toBeDefined();
	});

	function startOnEnd(
		endRedirectUrl?: string,
		pageOverride: Partial<Page> = {},
	) {
		const page: Page = { ...endPage, ...pageOverride, endRedirectUrl };
		startSessionMock.mockResolvedValue({
			sessionId: "sess-1234567890",
			configId: "test-experiment",
			config: compiledConfig,
			currentPageId: "end",
			page,
			endedAt: "2026-09-25T00:00:00.000Z",
		});
	}

	test("falls back to the default completion card when an end page has no components", async () => {
		startOnEnd(undefined, { components: [] });
		renderApp();
		expect(await screen.findByText("Thanks, that's it.")).toBeDefined();
		expect(screen.getByText("You can close this window.")).toBeDefined();
		expect(screen.queryByRole("button", { name: /examples/i })).toBeNull();
	});

	test("renders end page components alongside the redirect CTA", async () => {
		startOnEnd("https://app.prolific.com/submissions/complete?cc=AB12", {
			components: [
				{ type: "text", props: { text: "Debriefing details here." } },
			],
		});
		renderApp();
		expect(await screen.findByText("Debriefing details here.")).toBeDefined();
		expect(
			screen.getByRole("button", { name: "Continue to Prolific" }),
		).toBeDefined();
		expect(screen.queryByText("Thanks, that's it.")).toBeNull();
	});

	test("does not follow a javascript: end redirect", async () => {
		startOnEnd("javascript:alert(document.cookie)", { components: [] });
		renderApp();
		expect(await screen.findByText("You can close this window.")).toBeDefined();
		expect(screen.queryByRole("button", { name: /Continue/ })).toBeNull();
	});

	test("labels only real Prolific hosts as Prolific", async () => {
		startOnEnd("https://evil.test/?next=prolific.com");
		const { unmount } = renderApp();
		expect(
			await screen.findByRole("button", { name: "Continue" }),
		).toBeDefined();
		expect(screen.queryByText("Continue to Prolific")).toBeNull();
		unmount();

		startOnEnd("https://app.prolific.com/submissions/complete?cc=AB12");
		renderApp();
		expect(
			await screen.findByRole("button", { name: "Continue to Prolific" }),
		).toBeDefined();
		expect(screen.queryByRole("button", { name: /examples/i })).toBeNull();
	});

	test("does not put the full session id in the header", async () => {
		startOnEnd("https://x.test");
		const { container } = renderApp();
		expect(await screen.findByText("Session: sess-123…")).toBeDefined();
		expect(container.innerHTML).not.toContain("sess-1234567890");
	});

	test("does not show Sign in with Google in the header during a session", async () => {
		startOnIntro();
		renderApp();
		expect(await screen.findByText("Welcome to the study.")).toBeDefined();
		expect(
			screen.queryByRole("button", { name: "Sign in with Google" }),
		).toBeNull();
	});

	test("shows Sign in with Google only when the experiment requires auth", async () => {
		startSessionMock.mockRejectedValue(new AuthRequiredError());
		renderApp();
		expect(
			await screen.findByRole("button", { name: "Sign in with Google" }),
		).toBeDefined();
	});

	test("waits for advance before mounting a timed page so an already-expired timer chains through", async () => {
		const timedPage: Page = {
			id: "timed",
			components: [
				{ type: "text", props: { text: "Timed drafting phase." } },
				{
					type: "timer",
					id: "timer-1",
					props: {
						duration: 60,
						scope: "group",
						action: { type: "go_to", target: "thanks" },
					},
				},
			],
		};
		const introToTimed: Page = {
			...introPage,
			components: [
				{ type: "text", props: { text: "Welcome to the study." } },
				{
					type: "buttons",
					props: {
						buttons: [
							{
								id: "next",
								text: "Continue",
								action: { type: "go_to", target: "timed" },
							},
						],
					},
				},
			],
		};
		startSessionMock.mockResolvedValue({
			sessionId: "sess-1",
			configId: "test-experiment",
			config: {
				...compiledConfig,
				pages: {
					...compiledConfig.pages,
					intro: introToTimed,
					timed: timedPage,
				},
			},
			currentPageId: "intro",
			page: introToTimed,
		});

		const firstAdvance = deferred<Awaited<ReturnType<typeof advance>>>();
		advanceMock
			.mockReturnValueOnce(firstAdvance.promise)
			.mockResolvedValueOnce({
				sessionId: "sess-1",
				currentPageId: "thanks",
				page: thanksPage,
				endedAt: null,
			});
		const now = Date.now();
		startTimerMock.mockResolvedValue({
			timerKey: "page:timed:timer-1",
			startedAt: now - 120_000,
			expiresAt: now - 5_000,
			serverNow: now,
			duration: 60,
			scope: "group",
		});

		Object.defineProperty(document, "hidden", {
			configurable: true,
			get: () => true,
		});
		try {
			renderApp();
			expect(await screen.findByText("Welcome to the study.")).toBeDefined();

			fireEvent.click(screen.getByRole("button", { name: "Continue" }));

			await waitFor(() => {
				expect(advanceMock).toHaveBeenCalledWith("sess-1", "timed");
			});
			expect(startTimerMock).not.toHaveBeenCalled();

			firstAdvance.resolve({
				sessionId: "sess-1",
				currentPageId: "timed",
				page: timedPage,
				endedAt: null,
			});

			expect(await screen.findByText("All done.")).toBeDefined();
			expect(advanceMock).toHaveBeenCalledTimes(2);
			expect(advanceMock).toHaveBeenNthCalledWith(
				2,
				"sess-1",
				"thanks",
				expect.any(String),
			);
		} finally {
			Object.defineProperty(document, "hidden", {
				configurable: true,
				get: () => false,
			});
		}
	});
});
