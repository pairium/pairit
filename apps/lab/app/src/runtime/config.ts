import type { Page } from "./types";

export interface CompiledConfig {
	initialPageId: string;
	pages: Record<string, Page>;
}
