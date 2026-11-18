import { describe, expect, test } from "bun:test";
import { toClientConfig } from "./client-config";

describe("toClientConfig", () => {
	const config = {
		initialPageId: "intro",
		pages: {
			intro: { id: "intro", components: [] },
			end: {
				id: "end",
				end: true,
				endRedirectUrl:
					"https://app.prolific.com/submissions/complete?cc=SECRET",
			},
		},
		agents: [
			{
				id: "bot",
				model: "gpt-x",
				system: "secret prompt",
				avatar: "Bot",
				tools: [{ name: "t", description: "d" }],
			},
		],
	};

	test("keeps only agent id and avatar", () => {
		expect(toClientConfig(config).agents as unknown).toEqual([
			{ id: "bot", avatar: "Bot" },
		]);
	});

	test("removes endRedirectUrl from every page", () => {
		const client = toClientConfig(config);
		expect(client.pages.end as unknown).toEqual({ id: "end", end: true });
		expect(JSON.stringify(client)).not.toContain("SECRET");
		expect(JSON.stringify(client)).not.toContain("secret prompt");
	});

	test("does not change the server's config", () => {
		toClientConfig(config);
		expect(config.pages.end.endRedirectUrl).toContain("SECRET");
		expect(config.agents[0].system).toBe("secret prompt");
	});

	test("handles legacy nodes", () => {
		const client = toClientConfig({
			nodes: [{ id: "end", endRedirectUrl: "https://x" }],
		});
		expect(client.nodes as unknown).toEqual([{ id: "end" }]);
	});
});
