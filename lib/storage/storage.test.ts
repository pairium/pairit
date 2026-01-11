/**
 * Storage Module Tests
 */
import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalStorage } from "./local";
import { createStorage } from "./index";

describe("LocalStorage", () => {
    let tempDir: string;
    let storage: LocalStorage;

    beforeEach(async () => {
        tempDir = await mkdtemp(join(tmpdir(), "storage-test-"));
        storage = new LocalStorage(tempDir);
    });

    afterEach(async () => {
        await rm(tempDir, { recursive: true, force: true });
    });

    test("put and get a file", async () => {
        await storage.put("test.txt", "hello world");
        const result = await storage.get("test.txt");
        expect(result?.toString()).toBe("hello world");
    });

    test("put and get binary data", async () => {
        const data = Buffer.from([0x00, 0x01, 0x02, 0xff]);
        await storage.put("binary.bin", data);
        const result = await storage.get("binary.bin");
        expect(result).toEqual(data);
    });

    test("put creates nested directories", async () => {
        await storage.put("a/b/c/deep.txt", "nested");
        const result = await storage.get("a/b/c/deep.txt");
        expect(result?.toString()).toBe("nested");
    });

    test("get returns null for missing file", async () => {
        const result = await storage.get("nonexistent.txt");
        expect(result).toBeNull();
    });

    test("delete removes file", async () => {
        await storage.put("to-delete.txt", "temporary");
        const deleted = await storage.delete("to-delete.txt");
        expect(deleted).toBe(true);

        const result = await storage.get("to-delete.txt");
        expect(result).toBeNull();
    });

    test("delete returns false for missing file", async () => {
        const deleted = await storage.delete("nonexistent.txt");
        expect(deleted).toBe(false);
    });

    test("exists returns true for existing file", async () => {
        await storage.put("exists.txt", "data");
        expect(await storage.exists("exists.txt")).toBe(true);
    });

    test("exists returns false for missing file", async () => {
        expect(await storage.exists("missing.txt")).toBe(false);
    });

    test("list returns all files", async () => {
        await storage.put("file1.txt", "a");
        await storage.put("file2.txt", "b");
        await storage.put("subdir/file3.txt", "c");

        const files = await storage.list();
        expect(files.sort()).toEqual(["file1.txt", "file2.txt", "subdir/file3.txt"].sort());
    });

    test("list with prefix filters files", async () => {
        await storage.put("foo/a.txt", "a");
        await storage.put("foo/b.txt", "b");
        await storage.put("bar/c.txt", "c");

        const files = await storage.list("foo");
        expect(files.sort()).toEqual(["foo/a.txt", "foo/b.txt"].sort());
    });

    test("list returns empty for nonexistent prefix", async () => {
        const files = await storage.list("nodir");
        expect(files).toEqual([]);
    });

    test("getUrl returns file:// URL", async () => {
        await storage.put("test.txt", "data");
        const url = await storage.getUrl("test.txt");
        expect(url).toMatch(/^file:\/\//);
        expect(url).toContain("test.txt");
    });

    test("prevents path traversal", async () => {
        await storage.put("../escape.txt", "should be inside tempDir");
        const escapedPath = join(tempDir, "escape.txt");
        const result = await storage.get("escape.txt");
        expect(result?.toString()).toBe("should be inside tempDir");
    });
});

describe("createStorage", () => {
    test("creates LocalStorage by default", () => {
        const storage = createStorage({ backend: "local", location: "/tmp/test" });
        expect(storage).toBeInstanceOf(LocalStorage);
    });

    test("creates LocalStorage from env", () => {
        const originalBackend = process.env.STORAGE_BACKEND;
        const originalPath = process.env.STORAGE_PATH;

        process.env.STORAGE_BACKEND = "local";
        process.env.STORAGE_PATH = "/tmp/env-test";

        const storage = createStorage();
        expect(storage).toBeInstanceOf(LocalStorage);

        process.env.STORAGE_BACKEND = originalBackend;
        process.env.STORAGE_PATH = originalPath;
    });
});
