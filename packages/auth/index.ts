/**
 * Shared Better Auth configuration factory.
 * Each app (lab, manager) constructs its own instance via createAuth() so
 * app-specific concerns like database hooks can vary.
 */

import { getClient, getDbName } from "@pairit/db";
import type { BetterAuthOptions } from "better-auth";
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";

const IS_DEV = process.env.NODE_ENV === "development";
const DEV_AUTH_SECRET = "development-secret-do-not-use-in-production-32chars";

function getAuthSecret(): string {
	const secret = process.env.AUTH_SECRET;
	if (!secret) {
		if (IS_DEV) {
			console.warn(
				"[Auth] AUTH_SECRET not set, using insecure development default",
			);
			return DEV_AUTH_SECRET;
		}
		throw new Error(
			"AUTH_SECRET environment variable is required in production",
		);
	}
	if (secret.length < 32) {
		if (IS_DEV) {
			console.warn(
				"[Auth] AUTH_SECRET is less than 32 characters, this is insecure",
			);
			return secret.padEnd(32, "0");
		}
		throw new Error("AUTH_SECRET must be at least 32 characters in production");
	}
	return secret;
}

function getBaseURL(): string {
	if (process.env.AUTH_BASE_URL) {
		return new URL(process.env.AUTH_BASE_URL).origin;
	}
	if (IS_DEV) {
		const port = process.env.PORT || 3000;
		return `http://localhost:${port}`;
	}
	throw new Error(
		"AUTH_BASE_URL environment variable is required in production",
	);
}

export interface CreateAuthOptions {
	databaseHooks?: BetterAuthOptions["databaseHooks"];
	onAPIError?: BetterAuthOptions["onAPIError"];
}

export function createAuth(options: CreateAuthOptions = {}) {
	const finalSecret = getAuthSecret();
	const client = getClient();
	const dbName = getDbName();
	const baseURL = getBaseURL();
	console.log("[Auth] Initializing with baseURL:", baseURL);

	return betterAuth({
		database: mongodbAdapter(client.db(dbName)),
		baseURL,
		basePath: "/api/auth",
		secret: finalSecret,
		trustedOrigins: [
			...(process.env.AUTH_TRUSTED_ORIGINS
				? process.env.AUTH_TRUSTED_ORIGINS.split(",")
				: []),
			baseURL,
			...(IS_DEV
				? [
						"http://localhost:3000",
						"http://localhost:3001",
						"http://localhost:3002",
						"http://localhost:3003",
					]
				: []),
		],
		socialProviders: {
			google: {
				clientId: process.env.GOOGLE_CLIENT_ID || "",
				clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
				scope: ["email", "profile", "openid"],
			},
		},
		session: {
			expiresIn: 60 * 60 * 24 * 7,
			updateAge: 60 * 60 * 24,
			cookieCache: {
				enabled: true,
				maxAge: 5 * 60,
			},
		},
		databaseHooks: options.databaseHooks,
		onAPIError: options.onAPIError,
	});
}

export type Auth = ReturnType<typeof createAuth>;
export type { Session, User } from "./types";
