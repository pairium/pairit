# Realtime

Server-Sent Events (SSE) power real-time updates for matchmaking, chat, and state synchronization.

## SSE Connection

Clients connect to `GET /sse/:sessionId` and receive events:

| Event | Description |
|-------|-------------|
| `match_found` | Matchmaking succeeded, includes `groupId` and `treatment` |
| `match_timeout` | Matchmaking timed out |
| `chat_message` | New message in chat group |
| `chat_message_delta` | Streaming agent response (partial text) |
| `chat_ended` | Chat terminated (via agent `end_chat` tool) |
| `state_updated` | User state changed server-side |

## Matchmaking Flow

1. Client joins pool via `POST /matchmaking/join`
2. Server queues session, applies FIFO matching
3. On match: broadcasts `match_found` to all group members, writes `chat_group_id` to state
4. On timeout: broadcasts `match_timeout`, client navigates to `timeoutTarget`

## Chat Flow

1. Client loads history via `GET /chat/:groupId/history`
2. Client subscribes to SSE for live updates
3. Messages sent via `POST /chat/:groupId/message`
4. Agent responses stream as `chat_message_delta` events, finalize as `chat_message`

## Agent Integration

When a chat message arrives:
1. Server loads agents attached to the current page's chat component
2. Each agent receives the full conversation history
3. Agent responses stream in real-time via SSE
4. Tool calls (e.g., `end_chat`) execute server-side and broadcast state updates
