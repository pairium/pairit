/**
 * Storage Module Entry Point
 *
 * Factory for creating storage backends based on configuration.
 */

import { GCSStorage } from "./gcs";
import { LocalStorage } from "./local";
import type { StorageBackend, StorageOptions } from "./types";

export { GCSStorage } from "./gcs";
export { LocalStorage } from "./local";
export type { SignedUpload, StorageBackend, StorageOptions } from "./types";

/**
 * Create a storage backend based on configuration or environment variables.
 *
 * Environment variables:
 * - STORAGE_BACKEND: "local" | "gcs"
 * - STORAGE_PATH: path for local, bucket name for GCS
 * - GCP_PROJECT_ID: optional, for GCS
 */
export function createStorage(options?: StorageOptions): StorageBackend {
	const backend =
		options?.backend ??
		(process.env.STORAGE_BACKEND as "local" | "gcs") ??
		"local";
	const location = options?.location ?? process.env.STORAGE_PATH ?? "./storage";

	if (backend === "gcs") {
		const projectId = options?.projectId ?? process.env.GCP_PROJECT_ID;
		return new GCSStorage(location, projectId);
	}

	return new LocalStorage(location);
}

/**
 * Default storage instance - uses environment variables
 */
export const storage = createStorage();
