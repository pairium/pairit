/**
 * Lab Server Entry Point
 * Elysia app with session and config management + Static Serving
 */

import { resolve } from "node:path";
import { cors } from "@elysiajs/cors";
import { auth } from "@pairit/auth";
import { Elysia } from "elysia";
import { ensureIndexes } from "./lib/db";
import { chatRoutes } from "./routes/chat";
import { eventsRoutes } from "./routes/events";
import { matchmakingRoutes } from "./routes/matchmaking";
import { randomizeRoutes } from "./routes/randomize";
import { sessionsRoutes } from "./routes/sessions";
import { streamRoutes } from "./routes/stream";

const IS_DEV = process.env.NODE_ENV === "development";
const RAW_CORS_ORIGINS = process.env.CORS_ORIGINS;
const ALLOWED_ORIGINS = RAW_CORS_ORIGINS
	? RAW_CORS_ORIGINS.split(",")
			.map((s) => s.trim())
			.filter(Boolean)
	: [];
if (!IS_DEV && ALLOWED_ORIGINS.length === 0) {
	console.warn(
		"[CORS] CORS_ORIGINS not set; disabling cross-origin access in production",
	);
}

// Use process.cwd() which is safer in Docker (WORKDIR /app/lab/server)
const distPath = resolve(process.cwd(), "../app/dist");
console.log("Serving static assets from:", distPath);

const app = new Elysia().use(
	cors({
		// In dev, allow specific origins for credentials to work (can't use * with credentials)
		origin: IS_DEV
			? [
					"http://localhost:3000",
					"http://localhost:3001",
					"http://127.0.0.1:3000",
					"http://127.0.0.1:3001",
				]
			: ALLOWED_ORIGINS,
		credentials: true, // Allow cookies for Better Auth sessions
		methods: ["GET", "POST", "OPTIONS"],
		allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
		exposeHeaders: ["Content-Type"],
		maxAge: 86400,
	}),
);

// Debug endpoints only available in non-production
if (IS_DEV) {
	app.get("/debug-fs", async () => {
		try {
			const fs = await import("node:fs/promises");
			const configsPath = `${distPath}/configs`;
			const files = await fs
				.readdir(configsPath)
				.catch((err) => [`Error reading ${configsPath}: ${err.message}`]);
			const rootFiles = await fs
				.readdir(distPath)
				.catch((err) => [`Error reading ${distPath}: ${err.message}`]);

			return {
				cwd: process.cwd(),
				importMetaDir: import.meta.dir,
				distPath,
				configsError: null,
				configs: files,
				rootDist: rootFiles,
			};
		} catch (e) {
			return { error: e instanceof Error ? e.message : String(e) };
		}
	});
}

// Mount Better Auth handler - handles all paths under /api/auth/
// Using onRequest hook to intercept all auth paths before other routes
app.onRequest(({ request }) => {
	const url = new URL(request.url);
	if (url.pathname.startsWith("/api/auth/")) {
		return auth.handler(request);
	}
});

app

	// API Routes
	.use(sessionsRoutes)
	.use(eventsRoutes)
	.use(streamRoutes)
	.use(chatRoutes)
	.use(matchmakingRoutes)
	.use(randomizeRoutes);

// Static file serving (production only - in dev, Vite handles this)
if (!IS_DEV) {
	app
		.get("/", () => Bun.file(`${distPath}/index.html`))
		.get("/favicon.ico", () => Bun.file(`${distPath}/favicon.ico`))
		.get("/manifest.json", () => Bun.file(`${distPath}/manifest.json`))
		.get("/logo192.png", () => Bun.file(`${distPath}/logo192.png`))
		.get("/logo512.png", () => Bun.file(`${distPath}/logo512.png`))
		.get("/assets/*", ({ params: { "*": path }, set }) => {
			const fullPath = resolve(distPath, "assets", path);
			if (!fullPath.startsWith(resolve(distPath, "assets"))) {
				set.status = 403;
				return "Forbidden";
			}
			return Bun.file(fullPath);
		})
		// Serve config files (YAML) for viewing
		.get("/configs/*", ({ params: { "*": path }, set }) => {
			const fullPath = resolve(distPath, "configs", path);
			if (!fullPath.startsWith(resolve(distPath, "configs"))) {
				set.status = 403;
				return "Forbidden";
			}
			if (path.endsWith(".yaml")) {
				set.headers["content-type"] = "text/yaml";
			}
			return Bun.file(fullPath);
		})
		// SPA catch-all for client-side routes (exclude /api/* paths)
		.get("*", ({ path }) => {
			if (path.startsWith("/api/")) {
				return new Response("Not Found", { status: 404 });
			}
			return Bun.file(`${distPath}/index.html`);
		});
}

app.listen(Number(process.env.PORT) || 3001);

console.log(
	`🚀 Lab server running on ${app.server?.hostname}:${app.server?.port}`,
);

ensureIndexes().catch((err) => {
	console.error("[DB] Failed to ensure indexes:", err);
});
