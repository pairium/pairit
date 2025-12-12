/**
 * Storage Backend Interface
 *
 * Abstract interface for file storage operations.
 * Implementations: LocalStorage (filesystem), GCSStorage (Google Cloud Storage)
 */

export interface StorageBackend {
    /**
     * Store data at the given key
     */
    put(key: string, data: Buffer | Uint8Array | string): Promise<void>;

    /**
     * Retrieve data for the given key
     * @returns The data, or null if not found
     */
    get(key: string): Promise<Buffer | null>;

    /**
     * Delete data at the given key
     * @returns true if deleted, false if key didn't exist
     */
    delete(key: string): Promise<boolean>;

    /**
     * List all keys with the given prefix
     */
    list(prefix?: string): Promise<string[]>;

    /**
     * Check if a key exists
     */
    exists(key: string): Promise<boolean>;

    /**
     * Get a signed URL for direct access (for GCS) or a local file path
     */
    getUrl(key: string, expiresInSeconds?: number): Promise<string>;
}

export interface StorageOptions {
    backend: "local" | "gcs";
    /** For local: base directory path. For GCS: bucket name */
    location: string;
    /** GCS project ID (only for GCS backend) */
    projectId?: string;
}
