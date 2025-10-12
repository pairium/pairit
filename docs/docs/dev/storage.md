# Storage

Firestore
- configs/{configId} → { publishedConfigId, owner, permissions, metadata, ...config, checksum }
- sessions/{sessionId} → { currentPageId, user_state, user_group, endedAt? }
- groups/{groupId} → shared group state
- events/{eventId} → audit events (assignments, matches, chat summaries)

RTDB
- chats/{chat_group_id} → chat messages
- matchmaking/{poolId} → queue entries (runtime-managed)

Notes
- Config documents store the canonical compiled JSON used at runtime; the checksum guards against accidental drift.
- Session documents record the current page and state snapshot so participants can reconnect safely.
- Group documents track shared fields (e.g., `chat_group_id`) that match the schema declared in `group_state`.
- Chat rooms stream message objects `{ id, text, role, senderId?, agentId?, timestamp }` for low-latency updates.


