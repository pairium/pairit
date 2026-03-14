import type { ChatAvatarConfig } from "@app/lib/participant-icons";
import type { Page } from "./types";

export interface CompiledConfig {
	initialPageId: string;
	pages: Record<string, Page>;
	agents?: Array<{
		id: string;
		avatar?: ChatAvatarConfig;
	}>;
}
