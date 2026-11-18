import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	attachWorkspaceFilesToCompiledConfig,
	resolveHtmlSource,
	resolveInsideConfigDir,
} from "./html-assets";

let root: string;
let configDir: string;

beforeAll(async () => {
	root = await mkdtemp(path.join(tmpdir(), "pairit-assets-"));
	configDir = path.join(root, "experiment");
	await mkdir(path.join(configDir, "pages"), { recursive: true });
	await writeFile(path.join(configDir, "pages", "ok.html"), "<p>ok</p>");
	await writeFile(path.join(root, "secret.html"), "SECRET");
	await writeFile(path.join(root, "secret.json"), '{"token":"SECRET"}');
	await symlink(
		path.join(root, "secret.html"),
		path.join(configDir, "leak.html"),
	);
	await symlink(
		path.join(root, "secret.json"),
		path.join(configDir, "leak.json"),
	);
	await symlink(root, path.join(configDir, "up"));
	await symlink(
		path.join(configDir, "pages", "ok.html"),
		path.join(configDir, "alias.html"),
	);
});

afterAll(async () => {
	await rm(root, { recursive: true, force: true });
});

describe("resolveInsideConfigDir", () => {
	test("allows files and in-directory symlinks", async () => {
		expect(
			await resolveHtmlSource("pages/ok.html", "c", configDir),
		).toMatchObject({ bytes: 9 });
		expect(await resolveHtmlSource("alias.html", "c", configDir)).toMatchObject(
			{ bytes: 9 },
		);
	});

	test.each([
		"leak.html",
		"up/secret.html",
		"../secret.html",
	])("refuses %p, which resolves outside the config directory", async (src) => {
		await expect(resolveHtmlSource(src, "c", configDir)).rejects.toThrow(
			"must stay inside the config directory",
		);
	});

	test("reports a missing file as missing", async () => {
		expect(await resolveInsideConfigDir(configDir, "nope.html")).toEqual({
			error: "missing",
		});
	});

	test("refuses a workspace schema symlinked outside", async () => {
		const compiled = {
			pages: [
				{
					components: [
						{ type: "live-workspace", id: "w", props: { schema: "leak.json" } },
					],
				},
			],
		};
		await expect(
			attachWorkspaceFilesToCompiledConfig(
				path.join(configDir, "c.yaml"),
				compiled,
			),
		).rejects.toThrow("must stay inside the config directory");
	});
});
