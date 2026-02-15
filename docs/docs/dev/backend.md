# Backend API

The backend is built with [ElysiaJS](https://elysiajs.com/) and runs on [Bun](https://bun.sh/). It consists of two services:

1.  **Lab Server** (`apps/lab/server`): Handles participant sessions, events, and delivering experiments.
2.  **Manager Server** (`apps/manager/server`): Handles experiment configuration management, media uploads, and administrative tasks.

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
-   **Lab Routes**: Routes derive an auth context (`requireAuth`, `user`) from the config’s `requireAuth` flag. When auth is required, the server will attempt to read a Better Auth session (cookies) and can attach `userId` to sessions when available.

## Endpoints

### Lab Server (Port 3001)

#### Sessions
-   `POST /sessions/start`: Start a new session.
    -   Body: `{ configId }`
    -   Return: `{ sessionId, configId, currentPageId, page }`
-   `GET /sessions/:id`: Get session state.
-   `POST /sessions/:id/advance`: Trigger an action.
    -   Body: `{ target }`
    -   Return: `{ sessionId, configId, currentPageId, page, endedAt }`
-   `POST /sessions/:id/events`: Log a user interaction event.

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

-   `GET /sse/:sessionId`: Server-Sent Events stream for the session. Events include:
    -   `match_found`: Matchmaking succeeded with group info
    -   `match_timeout`: Matchmaking timed out
    -   `chat_message`: New chat message in group
    -   `chat_message_delta`: Streaming agent response chunk
    -   `chat_ended`: Chat session terminated (by agent tool)
    -   `state_updated`: User state changed

## Chat

-   `GET /chat/:groupId/history`: Get chat message history
-   `POST /chat/:groupId/message`: Send a message to the group
-   `POST /chat/:groupId/agents/start`: Trigger agents with `sendFirstMessage: true`

## Matchmaking

-   `POST /matchmaking/join`: Join a matchmaking pool
-   `POST /matchmaking/cancel`: Leave the matchmaking queue

## Randomization

-   `POST /sessions/:id/randomize`: Assign treatment condition (idempotent)

## AI Agents

Agents are server-hosted LLM participants that join chat rooms. Configuration is stored in the experiment config's `agents` array.

-   Supported providers: OpenAI, Anthropic (inferred from model name)
-   Streaming: Agent responses stream via SSE `chat_message_delta` events
-   Tools: Agents can invoke tools like `end_chat` and `assign_state`
-   Keys: API keys stay server-side (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`)


