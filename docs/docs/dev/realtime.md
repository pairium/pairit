# Realtime

Matchmaking
- Pools: { id, num_users, timeoutSeconds? }
- Policy: FIFO by arrival; fill groups of num_users
- On match: write $.user_group.chat_group_id and emit match
- On timeout: emit timeout (default timeoutSeconds: 120)

Chat
- Scope: chats/{chat_group_id} in RTDB; ACL by group membership
- API: POST messages, SSE stream for updates
- Agents: server-hosted participants that can join rooms


