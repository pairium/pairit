# Storage

## Database (MongoDB)

All data is stored in MongoDB.

### Core Collections

-   **`configs`**: Published experiment configurations.
    -   Schema: `{ configId, owner, config, checksum, metadata, requireAuth, createdAt, updatedAt }`
-   **`sessions`**: Participant experimentation sessions (application state).
    -   Schema: `{ id, configId, config, currentPageId, user_state, userId?, endedAt?, createdAt, updatedAt }`
-   **`events`**: Audit events and telemetry.
    -   Schema: `{ sessionId, configId, pageId, componentType, componentId, type, timestamp, data, createdAt }`

### Authentication (Better Auth)

Managed by [Better Auth](https://www.better-auth.com/).

-   **`user`**: Registered users.
-   **`session`**: Authentication sessions (login state) - *distinct from experiment `sessions`*.
-   **`account`**: Linked OAuth accounts.

## Media (Storage Abstraction)

Media storage is handled by a `StorageAbstraction` layer that supports multiple backends based on the `STORAGE_BACKEND` environment variable.

### Interface

The abstraction provides a unified interface:
-   `upload(path, data, options)`
-   `list(bucket, prefix)`
-   `delete(path)`
-   `getUrl(path)`

### Backends

1.  **Local Filesystem (`local`)**:
    -   Used for development.
    -   Stores files in `./storage` (mounted volume in Docker).
    -   Serves files statically via Elysia.

2.  **Google Cloud Storage (`gcs`)**:
    -   Used for production.
    -   Stores files in a GCS bucket (configured via `STORAGE_PATH`).
    -   Requires `GOOGLE_APPLICATION_CREDENTIALS` or Workload Identity.

### Management

Manager endpoints interact with this abstraction layer.
-   `POST /media/upload` -> `storage.upload()`
-   `GET /media` -> `storage.list()`
-   `DELETE /media/:object` -> `storage.delete()`
