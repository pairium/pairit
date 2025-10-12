# Backend API

Endpoints
- POST /sessions/start → { sessionId, firstNode, initialState? }
- GET /sessions/{sessionId} → { currentPageId, user_state, user_group, endedAt? }
- POST /sessions/{sessionId}/advance → { event } → { newNode, updatedState? }
- GET /sessions/{sessionId}/stream → SSE stream of passive events
- POST /matchmaking/{poolId}/enqueue → { sessionId } → { position, estimatedWait? }
- POST /chat/{groupId}/messages → { text, role: "user" } → 204
- GET /chat/{groupId}/stream → SSE stream of messages
- POST /agents/{agentId}/call → server-side only invocation (streamed)


