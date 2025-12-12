/**
 * Google Cloud Storage Backend
 */
import { Storage } from "@google-cloud/storage";
import type { StorageBackend } from "./types";

export class GCSStorage implements StorageBackend {
    private bucket;

    constructor(bucketName: string, projectId?: string) {
        const storage = new Storage({ projectId });
        this.bucket = storage.bucket(bucketName);
    }

    async put(key: string, data: Buffer | Uint8Array | string): Promise<void> {
        const file = this.bucket.file(key);
        const buffer = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);
        await file.save(buffer);
    }

    async get(key: string): Promise<Buffer | null> {
        try {
            const file = this.bucket.file(key);
            const [contents] = await file.download();
            return contents;
        } catch (error: unknown) {
            if (error instanceof Error && "code" in error && error.code === 404) {
                return null;
            }
            throw error;
        }
    }

    async delete(key: string): Promise<boolean> {
        try {
            const file = this.bucket.file(key);
            await file.delete();
            return true;
        } catch (error: unknown) {
            if (error instanceof Error && "code" in error && error.code === 404) {
                return false;
            }
            throw error;
        }
    }

    async list(prefix = ""): Promise<string[]> {
        const [files] = await this.bucket.getFiles({ prefix });
        return files.map((file) => file.name);
    }

    async exists(key: string): Promise<boolean> {
        const file = this.bucket.file(key);
        const [exists] = await file.exists();
        return exists;
    }

    async getUrl(key: string, expiresInSeconds = 3600): Promise<string> {
        const file = this.bucket.file(key);
        const [url] = await file.getSignedUrl({
            action: "read",
            expires: Date.now() + expiresInSeconds * 1000,
        });
        return url;
    }
}
