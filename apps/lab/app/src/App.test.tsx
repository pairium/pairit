import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import App from "./App.tsx";

describe("App", () => {
	test("renders", async () => {
		// Setup Router for testing
		const rootRoute = createRootRoute({
			component: Outlet,
		});

		const experimentRoute = createRoute({
			getParentRoute: () => rootRoute,
			path: "/$experimentId",
			component: App,
		});

		const routeTree = rootRoute.addChildren([experimentRoute]);

		const router = createRouter({
			routeTree,
			history: createMemoryHistory({
				initialEntries: ["/test-experiment"],
			}),
		});

		render(<RouterProvider router={router} />);

		// Expect loading state or error state since we have no config
		expect(
			await screen.findByText(
				/Loading|Missing experiment ID|Config not found|Failed to parse URL/i,
			),
		).toBeDefined();
	});
});
