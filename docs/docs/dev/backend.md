# Backend API

Endpoints
- `POST /sessions/start`
  - Request: `{ publicId, participantId? }`
  - Response: `{ sessionId, firstNode, initialState? }`
- `GET /sessions/{sessionId}`
  - Response: `{ currentPageId, user_state, user_group, endedAt? }`
- `POST /sessions/{sessionId}/advance`
  - Request: `{ event: { type, payload } }`
  - Response: `{ newNode, updatedState? }`
- `GET /sessions/{sessionId}/stream`
  - Server-sent events: `match`, `timeout`, state updates, or other passive notifications
- `POST /matchmaking/{poolId}/enqueue`
  - Request: `{ sessionId }`
  - Response: `{ position, estimatedWait? }`
- `POST /chat/{groupId}/messages`
  - Request: `{ text: string, role: "user" }`
  - Response: `204` (message fans out via SSE)
- `GET /chat/{groupId}/stream`
  - Response: SSE stream of messages, including AI agent outputs
- `POST /agents/{agentId}/call`
  - Server-side only invocation. Streams LLM responses; clients never see provider keys.

Notes:
- Routing decisions rely on the `newNode` returned from `advance`; if the runtime ends the session, `endedAt` is set.
- Matchmaking events populate `$.user_group` (including `chat_group_id`) before the next page renders.
- Chat SSE responses include metadata (`timestamp`, `sender`, `agentId?`) so clients can distinguish speaker roles.


