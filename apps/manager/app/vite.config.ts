import type { IncomingMessage } from "node:http";
import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const MANAGER_SERVER = "http://localhost:3002";

// /configs, /data, /media, /admin are both app routes and API paths.
// When the browser asks for HTML (top-level navigation), let Vite serve the
// SPA shell so client routing can take over. Otherwise (fetch/XHR), proxy to
// the manager server.
function bypassToApp(req: IncomingMessage) {
	const accept = req.headers.accept ?? "";
	if (req.method === "GET" && accept.includes("text/html")) {
		return req.url;
	}
}

export default defineConfig({
	plugins: [viteReact(), tailwindcss()],
	resolve: {
		alias: {
			"@": resolve(__dirname, "./src"),
			"@app": resolve(__dirname, "./src"),
			"@components": resolve(__dirname, "./src/components"),
		},
	},
	server: {
		proxy: {
			"/api": { target: MANAGER_SERVER, changeOrigin: true },
			"/me": { target: MANAGER_SERVER, changeOrigin: true },
			"/configs": {
				target: MANAGER_SERVER,
				changeOrigin: true,
				bypass: bypassToApp,
			},
			"/data": {
				target: MANAGER_SERVER,
				changeOrigin: true,
				bypass: bypassToApp,
			},
			"/media": {
				target: MANAGER_SERVER,
				changeOrigin: true,
				bypass: bypassToApp,
			},
			"/admin": {
				target: MANAGER_SERVER,
				changeOrigin: true,
				bypass: bypassToApp,
			},
			"/login": { target: MANAGER_SERVER, changeOrigin: true },
			"/login-success": { target: MANAGER_SERVER, changeOrigin: true },
			"/access-denied": { target: MANAGER_SERVER, changeOrigin: true },
		},
	},
});
