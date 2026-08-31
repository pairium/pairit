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
import { advance, startSession } from "./lib/api";
import type { CompiledConfig } from "./runtime/config";
import type { Page } from "./runtime/types";

vi.mock("./lib/api", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./lib/api")>();
	return {
		...actual,
		startSession: vi.fn(),
		advance: vi.fn(),
		randomize: vi.fn(),
		submitEvent: vi.fn(),
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
	],
};

const compiledConfig: CompiledConfig = {
	initialPageId: "intro",
	pages: {
		intro: introPage,
		thanks: thanksPage,
	},
};

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

	test("keeps the current page visible while advancing", async () => {
		startSessionMock.mockResolvedValue({
			sessionId: "sess-1",
			configId: "test-experiment",
			config: compiledConfig,
			currentPageId: "intro",
			page: introPage,
		});

		const pendingAdvance = deferred<Awaited<ReturnType<typeof advance>>>();
		advanceMock.mockReturnValue(pendingAdvance.promise);

		renderApp();

		expect(await screen.findByText("Welcome to the study.")).toBeDefined();

		fireEvent.click(screen.getByRole("button", { name: "Continue" }));

		await waitFor(() => {
			expect(advanceMock).toHaveBeenCalledWith("sess-1", "thanks");
		});

		expect(screen.getByText("Welcome to the study.")).toBeDefined();
		expect(screen.queryByText("Loading…")).toBeNull();
		expect(screen.queryByRole("status", { name: "Loading" })).toBeNull();
		expect(screen.getByRole("button", { name: "Continue" })).toHaveProperty(
			"disabled",
			true,
		);

		pendingAdvance.resolve({
			sessionId: "sess-1",
			currentPageId: "thanks",
			page: thanksPage,
			endedAt: null,
		});

		expect(await screen.findByText("All done.")).toBeDefined();
		expect(screen.queryByText("Welcome to the study.")).toBeNull();
	});
});
