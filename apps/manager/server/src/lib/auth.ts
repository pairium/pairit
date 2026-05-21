import { createAuth } from "@pairit/auth";
import { allowlistHooks } from "./allowlist-hooks";

function getAccessDeniedURL(): string {
	const baseURL = process.env.AUTH_BASE_URL || "http://localhost:3002";
	return new URL("/access-denied", baseURL).toString();
}

export const auth = createAuth({
	databaseHooks: allowlistHooks,
	onAPIError: { errorURL: getAccessDeniedURL() },
});
