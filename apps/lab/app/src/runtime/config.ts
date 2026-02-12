import type { Page } from "./types";

export interface CompiledConfig {
	initialPageId: string;
	pages: Record<string, Page>;
}

const cache = new Map<string, CompiledConfig>();

export function registerConfig(id: string, config: CompiledConfig) {
	cache.set(id, config);
}

export function getConfig(id: string): CompiledConfig | undefined {
	return cache.get(id);
}
