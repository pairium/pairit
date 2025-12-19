# Backend API

The backend is built with [ElysiaJS](https://elysiajs.com/) and runs on [Bun](https://bun.sh/). It consists of two services:

1.  **Lab Server** (`lab/server`): Handles participant sessions, events, and delivering experiments.
2.  **Manager Server** (`manager/server`): Handles experiment configuration management, media uploads, and administrative tasks.

## Architecture

-   **Runtime**: Bun
-   **Framework**: Elysia
-   **Database**: MongoDB
-   **Validation**: TypeBox (integrated with Elysia)
-   **Authentication**: Better Auth (with MongoDB adapter)

## Validation (TypeBox)

All endpoints enforce strict input/output validation using TypeBox schemas. This ensures type safety and automatic Swagger documentation generation.

Example Schema:

```typescript
const ConfigSchema = Type.Object({
  configId: Type.String(),
  owner: Type.String(),
  requireAuth: Type.Optional(Type.Boolean()),
  // ...
});
```

## Authentication

Authentication is handled by [Better Auth](https://www.better-auth.com/).

-   **Manager Routes**: All routes are protected by `authMiddleware`, which verifies the session cookie or bearer token.
-   **Lab Routes**: Routes use `optionalAuthMiddleware`.
    -   If `requireAuth: true` (config default), users must be signed in via Google OAuth.
    -   If `requireAuth: false`, users can access sessions via a unique `token` query parameter without login (anonymous session).

## Endpoints

### Lab Server (Port 3001)

#### Sessions
-   `POST /sessions/start`: Start a new session.
    -   Body: `{ configId, participantId? }`
    -   Return: `{ sessionId, sessionToken, shareableLink, ... }`
-   `GET /sessions/:id`: Get session state.
    -   Auth: Requires valid session token or authenticated user.
-   `POST /sessions/:id/advance`: Trigger an action.
    -   Body: `{ event: { type, payload } }`
    -   Return: `{ newNode, ... }`
-   `GET /sessions/:id/events`: List past events for the session.

#### Configs
-   `GET /configs/:configId`: Fetch a specific experiment configuration.

### Manager Server (Port 3002)

#### Configs
-   `POST /configs/upload`: Upload/Publish a new experiment config.
    -   Body: `{ configId, owner, checksum, config, metadata }`
-   `GET /configs`: List configs (supports filtering by owner).
-   `DELETE /configs/:configId`: Delete a config.

#### Media
-   `POST /media/upload`: Upload a file to Cloud Storage (via abstraction).
    -   Body: `{ bucket, object, data (base64), ... }`
-   `GET /media`: List media objects.
-   `DELETE /media/:object`: Delete a media object.

## Live Updates (SSE)

-   `GET /sessions/:sessionId/stream`: Server-Sent Events for session updates (matchmaking, timeouts).
-   `GET /chat/:groupId/stream`: SSE for chat messages.

## AI Agents

-   `POST /agents/:agentId/call`: Server-side invocation of LLM agents. Keys are kept secure on the server.


