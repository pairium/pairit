import { describe, expect, test } from "bun:test";
import { copyFileSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	allowedTargets,
	clampTimeoutSeconds,
	configPages,
	findMatchmaking,
	findRandomization,
	getPath,
	sessionGroupSuffixes,
} from "./config-lookup";

const config = {
	initialPageId: "intro",
	pages: {
		intro: {
			id: "intro",
			components: [
				{
					type: "buttons",
					props: {
						buttons: [{ id: "b", action: { type: "go_to", target: "match" } }],
					},
				},
			],
		},
		match: {
			id: "match",
			components: [
				{
					type: "matchmaking",
					props: {
						poolId: "pairs",
						num_users: 3,
						timeoutSeconds: 999_999,
						timeoutTarget: "timeout",
						onMatchTarget: "chat",
						conditions: ["a", "b"],
					},
				},
			],
		},
		chat: {
			id: "chat",
			onEnter: [
				{
					type: "randomize",
					stateKey: "arm",
					conditions: ["x", "y"],
					assignmentType: "balanced_random",
				},
			],
			components: [
				{ type: "chat", props: { groupId: "side" } },
				{ type: "text", props: { groupId: "not-a-chat" } },
				{
					type: "buttons",
					props: {
						buttons: [
							{
								id: "next",
								action: {
									type: "go_to",
									branches: [
										{ when: "session_state.arm == 'x'", target: "x_end" },
										{ target: "y_end" },
									],
								},
							},
						],
					},
				},
			],
		},
		timeout: { id: "timeout", end: true },
		x_end: { id: "x_end", end: true },
		y_end: { id: "y_end", end: true },
	},
};

describe("findRandomization", () => {
	test("reads settings from the config", () => {
		expect(findRandomization(config, "arm")).toEqual({
			stateKey: "arm",
			assignmentType: "balanced_random",
			conditions: ["x", "y"],
			scope: "session",
			distribute: false,
		});
	});

	test("returns null for an unknown state key", () => {
		expect(findRandomization(config, "treatment")).toBeNull();
	});

	test("defaults the state key to treatment", () => {
		const c = {
			pages: {
				p: {
					id: "p",
					components: [{ type: "randomization", props: { conditions: ["a"] } }],
				},
			},
		};
		expect(findRandomization(c)?.conditions).toEqual(["a"]);
	});
});

describe("findMatchmaking", () => {
	test("reads the pool from its component and clamps the timeout", () => {
		expect(findMatchmaking(config, "pairs")).toEqual({
			poolId: "pairs",
			numUsers: 3,
			timeoutSeconds: 3600,
			timeoutTarget: "timeout",
			assignmentType: undefined,
			conditions: ["a", "b"],
		});
	});

	test("returns null for an unknown pool", () => {
		expect(findMatchmaking(config, "other")).toBeNull();
	});

	test("falls back to the top-level pool list", () => {
		const c = {
			pages: {},
			matchmaking: [
				{
					id: "p",
					num_users: 4,
					assignment: { type: "block", conditions: ["c"] },
				},
			],
		};
		expect(findMatchmaking(c, "p")).toMatchObject({
			numUsers: 4,
			timeoutSeconds: 120,
			assignmentType: "block",
			conditions: ["c"],
		});
	});

	test("clampTimeoutSeconds keeps 1-3600", () => {
		expect(clampTimeoutSeconds(0)).toBe(1);
		expect(clampTimeoutSeconds(30)).toBe(30);
		expect(clampTimeoutSeconds(1e12)).toBe(3600);
	});
});

describe("allowedTargets", () => {
	test("collects button, branch and matchmaking targets", () => {
		expect(allowedTargets(config.pages.intro)).toEqual(new Set(["match"]));
		expect(allowedTargets(config.pages.match)).toEqual(
			new Set(["timeout", "chat"]),
		);
		expect(allowedTargets(config.pages.chat)).toEqual(
			new Set(["x_end", "y_end"]),
		);
	});
});

describe("sessionGroupSuffixes", () => {
	test("has page ids and chat groupIds only", () => {
		const suffixes = sessionGroupSuffixes(config);
		expect(suffixes.has("chat")).toBe(true);
		expect(suffixes.has("side")).toBe(true);
		expect(suffixes.has("not-a-chat")).toBe(false);
		expect(suffixes.has("0")).toBe(false);
	});
});

describe("getPath", () => {
	test("reads dotted paths", () => {
		expect(getPath({ a: { b: "x" } }, "a.b")).toBe("x");
		expect(getPath({ "a.b": "flat" }, "a.b")).toBeUndefined();
		expect(getPath(undefined, "a")).toBeUndefined();
	});
});

// The targets each runtime component can navigate to, written out per
// component type to mirror the lab app. allowedTargets walks generically;
// this checks it doesn't miss a navigation in any example config.
function runtimeTargets(page: Record<string, unknown>): string[] {
	const targets: string[] = [];
	const fromAction = (action: unknown) => {
		if (!action || typeof action !== "object") return;
		const a = action as {
			target?: unknown;
			branches?: Array<{ target?: unknown }>;
		};
		if (typeof a.target === "string") targets.push(a.target);
		for (const b of a.branches ?? []) {
			if (typeof b.target === "string") targets.push(b.target);
		}
	};
	const components = (page.components ?? []) as Array<{
		type: string;
		props?: Record<string, unknown>;
	}>;
	for (const c of components) {
		const props = c.props ?? {};
		switch (c.type) {
			case "buttons":
				for (const b of (props.buttons ?? []) as Array<{ action?: unknown }>)
					fromAction(b.action);
				break;
			case "paged_survey":
				fromAction(props.completeAction);
				break;
			case "html":
			case "timer":
				fromAction(props.action);
				break;
			case "matchmaking":
				for (const key of ["onMatchTarget", "timeoutTarget"]) {
					if (typeof props[key] === "string") targets.push(props[key]);
				}
				break;
			case "randomization":
				if (typeof props.target === "string") targets.push(props.target);
				break;
		}
	}
	return targets;
}

describe("allowedTargets covers every example config", () => {
	const configsDir = path.resolve(import.meta.dir, "../../../../../configs");
	const cli = path.resolve(
		import.meta.dir,
		"../../../../manager/cli/src/index.ts",
	);
	const files = readdirSync(configsDir).filter((f) => f.endsWith(".yaml"));
	const outDir = mkdtempSync(path.join(tmpdir(), "pairit-configs-"));

	test("there are configs to check", () => {
		expect(files.length).toBeGreaterThan(0);
	});

	for (const file of files) {
		test(file, () => {
			const yamlPath = path.join(outDir, file);
			copyFileSync(path.join(configsDir, file), yamlPath);
			const result = Bun.spawnSync(
				["bun", "run", cli, "config", "compile", yamlPath],
				{ stdout: "pipe", stderr: "pipe" },
			);
			expect(result.exitCode).toBe(0);
			const compiled = JSON.parse(
				readFileSync(yamlPath.replace(/\.yaml$/, ".json"), "utf8"),
			);
			for (const page of configPages(compiled)) {
				const allowed = allowedTargets(page);
				for (const target of runtimeTargets(page)) {
					expect({
						page: page.id,
						target,
						allowed: allowed.has(target),
					}).toEqual({ page: page.id, target, allowed: true });
				}
			}
		});
	}
});
