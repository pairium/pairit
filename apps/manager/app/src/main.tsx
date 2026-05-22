import {
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
} from "@tanstack/react-router";
import { lazy, type ReactNode, StrictMode } from "react";
import ReactDOM from "react-dom/client";

import "./styles.css";

import { MeProvider } from "@app/lib/me-context";
import { AppShell } from "@components/layout/AppShell";
import { SignInGate } from "@components/SignInGate";
import { Allowlist } from "./routes/Allowlist";
import { ConfigData } from "./routes/ConfigData";
import { ConfigDetail } from "./routes/ConfigDetail";
import { ConfigGraph } from "./routes/ConfigGraph";
import { ConfigsList } from "./routes/ConfigsList";
import { Dashboard } from "./routes/Dashboard";
import { Media } from "./routes/Media";
import { NewConfig } from "./routes/NewConfig";
import { SessionDetail } from "./routes/SessionDetail";

let DevTools: () => ReactNode = () => null;
if (import.meta.env.DEV) {
	const LazyDevTools = lazy(() =>
		import("@tanstack/react-router-devtools").then((m) => ({
			default: m.TanStackRouterDevtools,
		})),
	);
	DevTools = () => <LazyDevTools />;
}

const rootRoute = createRootRoute({
	component: () => (
		<SignInGate>
			<MeProvider>
				<AppShell>
					<Outlet />
				</AppShell>
			</MeProvider>
			<DevTools />
		</SignInGate>
	),
});

const dashboardRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/",
	component: Dashboard,
});

const configsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/configs",
	component: ConfigsList,
});

const configNewRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/configs/new",
	component: NewConfig,
});

const configDetailRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/configs/$configId",
	component: ConfigDetail,
});

const configDataRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/configs/$configId/$subpage",
	component: ConfigData,
});

const sessionDetailRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/configs/$configId/sessions/$sessionId",
	component: SessionDetail,
});

const configGraphRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/configs/$configId/graph",
	component: ConfigGraph,
});

const mediaRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/media",
	component: Media,
});

const allowlistRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/admin/users",
	component: Allowlist,
});

const routeTree = rootRoute.addChildren([
	dashboardRoute,
	configsRoute,
	configNewRoute,
	configDetailRoute,
	sessionDetailRoute,
	configGraphRoute,
	configDataRoute,
	mediaRoute,
	allowlistRoute,
]);

const router = createRouter({
	routeTree,
	context: {},
	defaultPreload: "intent",
	scrollRestoration: true,
	defaultStructuralSharing: true,
	defaultPreloadStaleTime: 0,
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

const rootElement = document.getElementById("app");
if (rootElement && !rootElement.innerHTML) {
	const root = ReactDOM.createRoot(rootElement);
	root.render(
		<StrictMode>
			<RouterProvider router={router} />
		</StrictMode>,
	);
}
