import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const MANAGER_SERVER = "http://localhost:3002";

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
			"/configs": { target: MANAGER_SERVER, changeOrigin: true },
			"/data": { target: MANAGER_SERVER, changeOrigin: true },
			"/media": { target: MANAGER_SERVER, changeOrigin: true },
			"/admin": { target: MANAGER_SERVER, changeOrigin: true },
			"/login": { target: MANAGER_SERVER, changeOrigin: true },
			"/login-success": { target: MANAGER_SERVER, changeOrigin: true },
			"/access-denied": { target: MANAGER_SERVER, changeOrigin: true },
		},
	},
});
