# Realtime

This page describes the **intended** realtime model. The current Bun/Elysia + MongoDB stack in this repo does **not** yet implement a matchmaking or chat backend.

## Matchmaking (planned)
- Pools: `{ id, num_users, timeoutSeconds? }`
- Policy: FIFO by arrival; fill groups of `num_users`
- On match: write group info (e.g. `$.user_group.chat_group_id`) and emit a match event
- On timeout: emit a timeout event (default timeoutSeconds: 120)

## Chat (planned)
- Transport: Server-Sent Events (SSE) for streaming updates (and/or WebSockets if needed)
- API: post messages + stream updates
- Agents: server-hosted participants that can join rooms


