/**
 * Shared Better Auth configuration
 * Provides authentication with Google OAuth and MongoDB storage
 */

import { getClient, getDbName } from "@pairit/db";
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

const finalSecret = getAuthSecret();

// Use shared MongoDB client from @pairit/db
// Connection happens lazily on first auth operation via Better Auth's MongoDB adapter
const client = getClient();
const dbName = getDbName();

// In dev, derive base URL from PORT; in production, require AUTH_BASE_URL
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

const baseURL = getBaseURL();
console.log("[Auth] Initializing with baseURL:", baseURL);

export const auth = betterAuth({
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
				]
			: []),
	],

	// Enable email/password authentication
	emailAndPassword: {
		enabled: true,
		// Require email verification before allowing login
		requireEmailVerification: false,
	},

	// Configure Google OAuth
	socialProviders: {
		google: {
			clientId: process.env.GOOGLE_CLIENT_ID || "",
			clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
			// Request email scope explicitly
			scope: ["email", "profile", "openid"],
		},
	},

	// Session management
	session: {
		expiresIn: 60 * 60 * 24 * 7, // 7 days
		updateAge: 60 * 60 * 24, // Update session every 24 hours
		cookieCache: {
			enabled: true,
			maxAge: 5 * 60, // Cache for 5 minutes
		},
	},
});

export type { AuthContext, Session, User } from "./types";
