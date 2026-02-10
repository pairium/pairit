# Pairit System Design

## Status: What exists vs. what's planned

| Area | Status | Notes |
|------|--------|-------|
| Lab frontend (pages, routing, survey, buttons, text, media) | **Built** | Works in local + remote + hybrid modes |
| Lab server (sessions, events, configs) | **Built** | Elysia on Bun, MongoDB |
| Manager server (config CRUD, media upload) | **Built** | Auth-protected, ownership checks |
| Manager CLI (lint, compile, upload, media) | **Built** | Browser-based OAuth login |
| Auth (Better Auth + Google OAuth) | **Built** | Lab optional, Manager required |
| Storage (local + GCS) | **Built** | Abstraction layer working |
| Prolific integration | **Built** | Captures participant params |
| Matchmaking | **Not built** | FIFO pooling, atomic match-and-assign, 2+ users per group |
| Chat (human-human + AI) | **Not built** | SSE transport, markdown rendering |
| AI Agents | **Not built** | Server-side LLM calls via Vercel AI SDK |
| Expression engine | **Partially built** | Basic branching works. Simple comparisons only (`<`, `>`, `<=`, `>=`, `==`, `!=`, `&&`, `||`) |
| Config validation/linting | **Partially built** | CLI has basic lint, full JSON Schema checks incomplete |
| Manager web UI | **Not started** | CLI-only for v1 |

---

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│ PARTICIPANT BROWSER                                        │
│                                                            │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ Lab App (React 19 + Vite 7 + TailwindCSS 4)           │ │
│  │                                                       │ │
│  │ ┌──────────┐ ┌─────────┐ ┌───────────┐ ┌────────────┐ │ │
│  │ │ Runtime  │ │ Router  │ │ UserStore │ │ Components │ │ │
│  │ │ Registry │ │ Context │ │ Context   │ │ (UI + RT)  │ │ │
│  │ └──────────┘ └─────────┘ └───────────┘ └────────────┘ │ │
│  └───────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
                    │ HTTP + SSE
┌───────────────────────────────────────────────────────────┐
│ Lab Server (Elysia/Bun :3001)                             │
│                                                           │
│ ┌──────────┐ ┌─────────┐ ┌──────────┐ ┌─────────────────┐ │
│ │ Sessions │ │ Events  │ │ Configs  │ │ Auth (optional) │ │
│ └──────────┘ └─────────┘ └──────────┘ └─────────────────┘ │
│                                                           │
│                             ┌────────────┐ ┌───────────┐  │
│                             │ Matchmaker │ │ Agents    │  │
│                             │            │ │           │  │
│                             └────────────┘ └───────────┘  │
└───────────────────────────────────────────────────────────┘
                    │
┌────────────────────────────────────────────────────────────────────┐
│ MongoDB                                                            │
│                                                                    │
│ ┌──────────┐ ┌─────────┐ ┌─────────┐ ┌────────┐ ┌────────────────┐ │
│ │ sessions │ │ events  │ │ configs │ │ user   │ │ session (auth) │ │
│ └──────────┘ └─────────┘ └─────────┘ └────────┘ └────────────────┘ │
└────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────┐
│ EXPERIMENTER                                                  │
│                                                               │
│ ┌──────────────────┐       ┌────────────────────────────────┐ │
│ │ CLI (Commander)  │       │ Manager Server (Elysia :3002)  │ │
│ │ lint/compile/    │──────▶│ configs CRUD, media upload     │ │
│ │ upload/media     │       │ auth (Google OAuth required)   │ │
│ └──────────────────┘       └────────────────────────────────┘ │
│                                                               │
│                   ┌────────────────────────────────┐          │
│                   │ Storage (Local / GCS)          │          │
│                   └────────────────────────────────┘          │
└───────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Bun 1.1+ |
| Frontend | React 19, Vite 7, TailwindCSS 4, TanStack Router |
| Backend | Elysia, Bun |
| Database | MongoDB (via native driver) |
| Auth | Better Auth + Google OAuth |
| Storage | Local filesystem / Google Cloud Storage |
| CLI | Commander.js, YAML |
| Linting/Format | Biome |
| Types | TypeScript 5.9, strict mode |
| Testing | Vitest (frontend), Bun test (packages) |
| Deployment | Docker, Cloud Build, Cloud Run (GCP) |
| Docs | MkDocs (Python, shadcn theme) |

---

## Data Flow: Experiment Lifecycle

```
 1. AUTHOR        Experimenter writes YAML config
 2. VALIDATE      CLI: pairit config lint experiment.yaml
 3. COMPILE       CLI: pairit config compile → canonical JSON
 4. PUBLISH       CLI: pairit config upload → Manager Server → MongoDB
 5. SHARE         Experimenter sends link: lab-url/{configId}
 6. LOAD          Lab App fetches config (local JSON or remote API)
 7. SESSION       Lab App → POST /sessions/start → session UUID
 8. RENDER        Runtime resolves page → registry → React components
 9. INTERACT      Participant clicks/surveys/chats → events logged
10. ADVANCE       Button action → POST /sessions/:id/advance → next page
11. END           Page with end:true → session marked complete
12. REDIRECT      Optional endRedirectUrl (e.g., Prolific completion)
```

---

## Component System

The runtime is a config-driven renderer. No React components are referenced directly in configs — everything goes through a registry:

```
YAML config → compiler → canonical JSON → runtime registry → React component
```

In YAML configs, `survey:` is shorthand. The compiler desugars it to `components: [{type: survey, props: {questions: [...]}}]`. The runtime uses a uniform component model — all page content is rendered from the `components` array.

### Current components

- `text` → TextBlock — static text, optional markdown
- `buttons` → ButtonsRow / Button — navigation actions with event hooks
- `survey` → SurveyForm / PagedSurvey — questions with auto-save to user_state
- `media` → MediaBlock — image/video/audio display

### Planned components (v1)

- `matchmaking` → MatchmakingPanel — pool queue UI, countdown, match notification
- `chat` → ChatView — human-human and human-AI messaging

### Future components (v2+)

- `live-workspace` → Collaborative real-time document editing (requires WebSocket)
- `form` → General-purpose form fields (when Survey doesn't fit)

### Component anatomy

Each component has:
- A UI module (`Component.tsx`) — pure React
- A runtime adapter (`runtime.tsx`) — calls `defineRuntimeComponent()`
- Registration in the manifest (`components/runtime.ts`)

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Real-time transport | **SSE + POST** | Simpler than WebSocket, works with Elysia. Client sends via POST, server pushes via SSE. Reconnection via `Last-Event-ID` with server-side event replay. |
| Workspace | **Punted to v2** | Not needed for first experiments. Avoids WebSocket complexity. Add later with Yjs/Automerge over WS. |
| LLM providers | **Multi-provider (Vercel AI SDK)** | Unified streaming + tool use across OpenAI, Anthropic, xAI. Model string in YAML routes to provider. |
| Matchmaking | **Atomic FIFO, 2+ users** | Atomic match-and-assign via MongoDB findAndModify/transaction. No double-matching. Configurable timeout page. No backfill for v1. |
| Treatment assignment | **Config-driven, balanced random** | Server assigns conditions on match. Treatment and group_id written to `user_state`. Rules defined in YAML. |
| Agent tool use | **Built-in + custom** | Built-in: `end_chat` (no params, disables chat + highlights button), `assign_state` (writes to `user_state`, no validation). Custom: experimenter defines tool name + JSON Schema in config. |
| Chat format | **Markdown** | Messages rendered as markdown. Agents can format with bold, lists, etc. |
| Expression engine | **Simple comparisons** | Operators: `<`, `>`, `<=`, `>=`, `==`, `!=`, `&&`, `||`. Types: numbers, strings, booleans. Context: `user_state`. No library needed. |
| State namespace | **Single `user_state`** | No separate `user_group`. Matchmaking writes `group_id` and `treatment` directly to `user_state`. One namespace, one mental model. |
| Page components | **`survey:` shorthand** | `survey:` in YAML is shorthand; compiler desugars to `components` array. Runtime uses uniform component model. |
| Idempotency | **Client UUID on all POSTs** | All mutation endpoints require client-generated UUID. Server deduplicates. No duplicate events in research data. |
| State writes | **Field-level** | Field-level writes to `user_state`, not full document replacement. Concurrent writes from agent, surveys, and matchmaking don't clobber each other. |
| Agent errors | **Graceful fallback** | LLM timeout or failure → error message in chat, failure persisted as event. Participant never stuck on frozen chat. |
| Session cleanup | **Idle timeout** | Idle sessions timeout and are marked abandoned. Matchmaking pool slots released on disconnect. |
| Single-server (v1) | **In-memory state** | SSE connections and matchmaking pool are in-memory. Single server instance. Do not deploy behind load balancer without moving state to Redis. |
| Manager UI | **CLI-only for v1** | Experimenters are technical. Build web UI later. |
| Recruitment | **Prolific + direct links** | Prolific already integrated. Direct links work by default. |

---

## Real-time System

### Transport: SSE + POST

One SSE stream per session. All server→client events (matchmaking, chat, agent messages) flow through it. Client actions are regular POST requests with idempotency UUIDs.

Reconnection: client reconnects with `Last-Event-ID` header. Server replays missed events from cursor. No messages lost on network blips.

```
Client                          Lab Server
  │                                  │
  │── GET /sessions/:id/stream ────▶│  (SSE connection opened)
  │◀── event: match_found ──────────│
  │◀── event: chat_message ─────────│
  │◀── event: typing_start ─────────│
  │                                  │
  │── POST /chat/:groupId/send ───▶│  (client sends message, idempotency UUID)
  │◀── event: chat_message ─────────│  (broadcast to group via SSE)
  │                                  │
  │── (connection drops) ───────────│
  │── GET /stream (Last-Event-ID) ─▶│  (reconnect, replay missed events)
```

### Matchmaking

- `POST /sessions/:id/matchmake` — enqueue session in a pool
- Server-side FIFO matching: fill groups of `num_users` (2+) by arrival order
- Atomic match-and-assign via MongoDB findAndModify or transaction — no double-matching
- On match: server assigns treatment conditions (balanced random), writes `group_id` and `treatment` to `user_state`, broadcasts `match_found` via SSE
- On timeout: broadcasts `timeout` event, client routes to configurable timeout page
- On disconnect: pool slot released, session marked abandoned
- MongoDB collections: `matchmaking_pools` (queue state), `groups` (matched groups with treatment assignment)

### Chat

- `POST /chat/:groupId/send` — send a message (text, markdown) with idempotency UUID
- Messages broadcast to all group members via their SSE streams
- Messages persisted in `chat_messages` MongoDB collection with sender attribution
- Missed messages replayed via SSE `Last-Event-ID` reconnection
- Typing indicators: `POST /chat/:groupId/typing` → broadcast via SSE (not persisted)

### AI Agents

- Multi-provider via Vercel AI SDK (OpenAI, Anthropic, xAI)
- Agent joins chat room as a server-side participant, responds as a normal chat participant
- Agent receives chat history as context, responds with streaming markdown
- Streaming tokens broadcast via SSE as `agent_chunk` events, assembled client-side
- Built-in tools: `end_chat` (no params, disables chat + highlights continue button), `assign_state` (writes to `user_state`, no validation)
- Custom tools: experimenters define tool schemas in YAML config, server validates calls
- LLM failure → graceful error message in chat, failure persisted as event. Participant never stuck on frozen chat.
- API keys stored as server environment variables, never exposed to client

---

## Auth Model

| Context | Who | Method | Required? |
|---------|-----|--------|-----------|
| Lab | Participants | Google OAuth via Better Auth | Only if config has `requireAuth: true` |
| Manager | Experimenters | Google OAuth (CLI browser flow) | Always |

Lab sessions use a **Qualtrics-style model**: the session UUID is the authorization token. No login needed for public experiments.

---

## Dev Experience

```bash
bun install                          # one command installs everything
NODE_ENV=development bun run dev     # starts 3 services with hot reload
                                     #   lab-app    → localhost:3000 (Vite)
                                     #   lab-server → localhost:3001 (Elysia)
                                     #   manager    → localhost:3002 (Elysia)
```

- MongoDB: `brew services start mongodb-community` or `docker compose up -d mongodb`
- No Google OAuth needed for local dev (falls back to localhost MongoDB)
- Local configs in `apps/lab/app/public/configs/*.json` for frontend-only testing
- Biome for lint/format, TypeScript strict, Vitest + Bun test

---

## Participant Experience

### Current flow

1. Receive link → `lab-url/{configId}`
2. (Optional) Sign in with Google if experiment requires auth
3. See intro page → read instructions
4. Navigate through pages (text, surveys, media)
5. Survey answers auto-saved to `user_state`
6. Conditional branching based on responses
7. Reach `end: true` page → session marked complete
8. (Optional) Redirect to Prolific completion URL

### Target flow (v1)

1. Receive link → `lab-url/{configId}`
2. (Optional) Sign in with Google
3. Intro page → instructions
4. Pre-task survey
5. **Enter matchmaking queue → wait for group members (2+)**
6. **Get matched → treatment assigned to `user_state` → enter chat room**
7. **Chat with group members and/or AI agent (markdown messages, streaming)**
8. **Agent can call `end_chat` (disables chat) or `assign_state` (writes to `user_state`)**
9. Post-task survey → page branching per condition (separate survey pages, no `when` conditionals)
10. End → redirect to Prolific/etc.

### Future (v2+)

- Live collaborative workspace alongside chat (requires WebSocket)
- Backfill matchmaking with ghost agents
- Manager web UI

---

## Roadmap

### Priority: P0 (run experiments) → P1 (quality of life) → P2 (future)

### P0 — Run online experiments (weeks 1-3)

These block the first study. Ordered by dependency.

| # | Issue | Description | Depends on | Week |
|---|-------|-------------|------------|------|
| 1 | SSE transport layer | Add SSE support to lab server. Connection manager (Map of sessionId → controllers), heartbeat every 30s, `Last-Event-ID` reconnection with server-side event replay. | — | 1 |
| 2 | Expression engine | Simple comparison operators (`<`, `>`, `<=`, `>=`, `==`, `!=`, `&&`, `||`) on numbers, strings, booleans. Single context: `user_state`. No library needed. | — | 1 |
| 3 | Chat backend | `chat_messages` MongoDB collection. `POST /chat/:groupId/send` (with idempotency UUID) persists + broadcasts via SSE. Missed messages replayed via `Last-Event-ID`. Typing indicator broadcast (not persisted). | 1 | 1 |
| 4 | Chat frontend | Message list with markdown rendering, text input, typing indicators, auto-scroll, timestamps. Runtime adapter for `chat` component type. | 1, 3 | 1 |
| 5 | Matchmaking backend | `matchmaking_pools` + `groups` MongoDB collections. `POST /sessions/:id/matchmake` enqueues session. FIFO matching (`num_users` 2+), atomic match-and-assign (findAndModify/transaction). On match: balanced random treatment, write `group_id` and `treatment` to `user_state`, broadcast `match_found`. On timeout: broadcast `timeout`. On disconnect: release pool slot. | 1 | 2 |
| 6 | Matchmaking frontend | Queue UI: waiting spinner, participant count, countdown timer. On match: transition to next page. On timeout: route to configurable timeout page. Runtime adapter for `matchmaking` component type. | 1, 5 | 2 |
| 7 | AI agent integration | Vercel AI SDK for multi-provider support (OpenAI, Anthropic, xAI). Agent receives chat history, responds with streaming markdown via SSE (`agent_chunk` events). Graceful error handling: LLM failure → error message in chat, failure logged as event. API keys as server env vars. | 3 | 2 |
| 8 | Agent tool use | Built-in tools: `end_chat` (no params, disables chat + highlights button), `assign_state` (writes to `user_state`, no validation). Custom tools: experimenter defines tool name + JSON Schema in YAML config. Server validates tool calls, executes side effects, returns results to agent. | 7 | 3 |
| 9 | End-to-end flow wiring | Full config-driven flow: intro → survey → matchmaking → treatment assignment → chat (with agents) → post-survey → end → Prolific redirect. Test with Configs 0-3 from SPEC.md. | all above | 3 |

### P1 — Quality of life (weeks 3-4, parallel with P0 polish)

Nice to have before the first study, but not strictly blocking.

| # | Issue | Description | Depends on |
|---|-------|-------------|------------|
| 10 | Session cleanup | Idle session timeout, mark as abandoned, release matchmaking pool slots on disconnect. Configurable timeout per experiment. | — |
| 11 | Config download (`pairit config get`) | `pairit config get <configId> --out compiled.json` — download published config for auditing/debugging. | — |
| 12 | Full JSON Schema validation | Props schemas for all built-in components. Validate during `pairit config lint`. Catch config errors before upload. | — |
| 13 | Error boundaries | Graceful component failure — show fallback UI, log error event, don't crash the session. | — |
| 14 | Data export (CLI) | `pairit data export <configId> --format csv` — download sessions + events for analysis. No web UI needed. | — |

### P2 — Future

Build after the first study runs successfully.

| # | Issue | Description |
|---|-------|-------------|
| 15 | Live workspace component | Real-time collaborative document editing. Yjs/Automerge over WebSocket. |
| 16 | Backfill system | Ghost agents fill incomplete matchmaking groups. `backfilled` flag on group records. |
| 17 | `when` conditionals | Conditional show/hide on survey questions and components. Add back if page branching becomes painful with many conditions. |
| 18 | Horizontal scaling | Move SSE connections and matchmaking pool to Redis. Support multiple server instances behind load balancer. |
| 19 | Form component | General-purpose form fields (text, select, date, number). |
| 20 | Config simulation | `pairit simulate` — dry-run a config with mock inputs, report reachable paths. |
| 21 | Manager web dashboard | List experiments, view sessions, real-time session viewer. |
| 22 | Rate limiting | Per-IP and per-session limits on lab server endpoints. |
| 23 | E2E tests | Playwright tests for full experiment flows (Configs 0-3). |
| 24 | Monitoring & observability | Structured logging, health checks, request tracing. |
