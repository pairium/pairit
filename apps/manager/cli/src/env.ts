import process from "node:process";

export type EnvName = "production" | "staging";

type EnvUrls = { api: string; lab: string };

// Production still points at the original Cloud Run URLs until the
// pairit.pairium.ai domains are live (then flip it to the entry below).
export const ENVIRONMENTS: Record<EnvName, EnvUrls> = {
	production: {
		api: "https://manager-432501290611.us-central1.run.app",
		lab: "https://lab-432501290611.us-central1.run.app",
	},
	staging: {
		api: "https://pairit-api-staging.pairium.ai",
		lab: "https://pairit-staging.pairium.ai",
	},
};

let selected: EnvName | undefined;

export function parseEnvName(value: string): EnvName {
	if (value === "production" || value === "staging") return value;
	throw new Error(`Unknown environment "${value}". Use staging or production.`);
}

export function setEnv(name: EnvName) {
	selected = name;
}

export function getEnvName(): EnvName {
	if (selected) return selected;
	const fromEnv = process.env.PAIRIT_ENV;
	return fromEnv ? parseEnvName(fromEnv) : "production";
}

// PAIRIT_API_URL / PAIRIT_LAB_URL still win, so local dev keeps working.
export function getApiUrl(): string {
	return process.env.PAIRIT_API_URL || ENVIRONMENTS[getEnvName()].api;
}

export function getLabUrl(): string {
	return process.env.PAIRIT_LAB_URL || ENVIRONMENTS[getEnvName()].lab;
}

/**
 * Key for the saved login. Each API host gets its own, so logging in to
 * staging never replaces the production login. Production keeps the
 * original "default" key so existing logins survive.
 */
export function getCredentialKey(): string {
	const api = getApiUrl();
	if (api === ENVIRONMENTS.production.api) return "default";
	return new URL(api).host;
}
