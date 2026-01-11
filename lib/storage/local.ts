/**
 * Local Filesystem Storage Backend
 */
import { mkdir, readFile, writeFile, unlink, readdir, access, stat } from "node:fs/promises";
import { join, dirname, relative, resolve, sep } from "node:path";
import type { StorageBackend } from "./types";

export class LocalStorage implements StorageBackend {
    private resolvedBasePath: string;

    constructor(private basePath: string) {
        this.resolvedBasePath = resolve(basePath);
    }

    private getFullPath(key: string): string {
        // Resolve to absolute path - this normalizes .. sequences
        const fullPath = resolve(this.resolvedBasePath, key);

        // Verify result is still inside basePath to prevent path traversal attacks
        if (!fullPath.startsWith(this.resolvedBasePath + sep) && fullPath !== this.resolvedBasePath) {
            throw new Error('Path traversal attempt detected');
        }

        return fullPath;
    }

    async put(key: string, data: Buffer | Uint8Array | string): Promise<void> {
        const fullPath = this.getFullPath(key);
        await mkdir(dirname(fullPath), { recursive: true });
        await writeFile(fullPath, data);
    }

    async get(key: string): Promise<Buffer | null> {
        try {
            const fullPath = this.getFullPath(key);
            return await readFile(fullPath);
        } catch (error: unknown) {
            if (error instanceof Error && "code" in error && error.code === "ENOENT") {
                return null;
            }
            throw error;
        }
    }

    async delete(key: string): Promise<boolean> {
        try {
            const fullPath = this.getFullPath(key);
            await unlink(fullPath);
            return true;
        } catch (error: unknown) {
            if (error instanceof Error && "code" in error && error.code === "ENOENT") {
                return false;
            }
            throw error;
        }
    }

    async list(prefix = ""): Promise<string[]> {
        const searchPath = this.getFullPath(prefix);
        const results: string[] = [];

        try {
            await this.listRecursive(searchPath, results);
        } catch (error: unknown) {
            if (error instanceof Error && "code" in error && error.code === "ENOENT") {
                return [];
            }
            throw error;
        }

        // Return keys relative to basePath
        return results.map((fullPath) => relative(this.basePath, fullPath));
    }

    private async listRecursive(dir: string, results: string[]): Promise<void> {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            if (entry.isDirectory()) {
                await this.listRecursive(fullPath, results);
            } else {
                results.push(fullPath);
            }
        }
    }

    async exists(key: string): Promise<boolean> {
        try {
            const fullPath = this.getFullPath(key);
            await access(fullPath);
            return true;
        } catch {
            return false;
        }
    }

    async getUrl(key: string): Promise<string> {
        // For local storage, return the file path as a file:// URL
        const fullPath = this.getFullPath(key);
        return `file://${fullPath}`;
    }

    async getUploadUrl(): Promise<never> {
        throw new Error("not_supported");
    }
}
