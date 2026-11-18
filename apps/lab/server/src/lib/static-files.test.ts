import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { containedPath, staticFile } from "./static-files";

const root = mkdtempSync(join(tmpdir(), "lab-static-"));
const assets = join(root, "assets");
mkdirSync(join(assets, "sub"), { recursive: true });
mkdirSync(join(root, "assets-private"));
writeFileSync(join(assets, "app.js"), "ok");
writeFileSync(join(root, "assets-private", "secret.txt"), "no");

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("containedPath", () => {
	test("keeps paths inside the directory", () => {
		expect(containedPath(assets, "app.js")).toBe(join(assets, "app.js"));
	});

	test("refuses traversal and sibling prefixes", () => {
		expect(containedPath(assets, "../assets-private/secret.txt")).toBeNull();
		expect(containedPath(assets, "../../etc/passwd")).toBeNull();
		expect(containedPath(assets, "")).toBeNull();
	});
});

describe("staticFile", () => {
	test("returns a regular file", async () => {
		expect(await staticFile(assets, "app.js")).toBe(join(assets, "app.js"));
	});

	test("returns null for directories and missing files", async () => {
		expect(await staticFile(assets, "sub")).toBeNull();
		expect(await staticFile(assets, "")).toBeNull();
		expect(await staticFile(assets, "missing.js")).toBeNull();
	});

	test("returns null for a sibling directory", async () => {
		expect(await staticFile(assets, "../assets-private/secret.txt")).toBeNull();
	});
});
