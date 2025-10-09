# Pairit Technical Spec

## Overview

- **Scope**: Full system spec (DSL + runtime semantics + architecture + APIs + data model).
- **Goals**: Simple, auditable configuration-as-data for experiments; deterministic randomization; safe server-authoritative execution; reproducibility; portability across deployments; minimal frontend logic.
- **Non-goals**: Arbitrary user-provided code execution; exposing AI keys to clients; complex UI editors in this spec.
 - **Constraints**: Single-file config (no imports); distinct configs per environment; no localization in this spec.
 - **Expression language**: Use expr-eval with JSONPath-style roots (e.g., `$.user_state.*`) and a small standard library including a deterministic `rand()` seeded per experiment, group, and participant.

## Configuration DSL

The configuration is authored as YAML and compiled to a canonical JSON form at publish time. The schema is versioned and validated.

### Top-level structure

- **schema_version**: string, semantic version of the config schema, e.g., `"1.0.0"`.
- **initialNodeId**: string, required id of the node shown when the session starts.
- **nodes**: array of node definitions. Each node defines one page/state.
- **user_state**: declarative type schema for per-participant state.
- **group_state**: declarative type schema for per-group state.
- **queues**: array of queue definitions for matching.
- **agents**: array of AI agent definitions available to chat nodes.

### Nodes

Nodes are the primary page abstraction in a config. Each node represents one page/state in the study and is defined by the set of UI or interaction components that are mounted when the session enters that node. The node's main purpose is to declare which components appear on the page, their props, layout hints, conditional display rules, and the events those components may emit. Built-in components (first-class) include `text`, `buttons`, `survey`, `queue`, `chat`, `media`, and `form`. Custom components may also be mounted from the `components` registry (see Appendix A).

Common fields on a node:
- **id**: string, unique within the config.
- **end?**: boolean, when true the node is terminal and ends the session upon entry. Outgoing edges from an `end` node are invalid.
- **components?**: array of component instances shown on the page (preferred canonical form). Each instance is either a built-in component or a `component` reference to a registered custom component.
- **layout?**: optional layout metadata or presentation hints for the client (non-normative; used by the frontend for spacing/columns/etc).

For convenience, simple top-level helpers remain supported and are normalized at compile time into the `components` array:
- **text**: string (markdown supported) -> normalized to a `text` component instance.
- **buttons**: array of `{ text: string, action: Action }` -> normalized to a `buttons` component instance.

Component instance shapes (canonical):
- **Built-in `text`**: `{ type: "text", props: { text: string, markdown?: bool } }`
- **Built-in `buttons`**: `{ type: "buttons", props: { buttons: [ { text: string, action: Action } ] } }`
- **Built-in `survey`**: `{ type: "survey", props: { questions: [ { id: string, text: string, answer: AnswerType, choices?: string[] } ] } }` (on submit, validates answers, writes to `$.user_state` by question `id`, emits `complete`)
- **Built-in `queue`**: `{ type: "queue", props: { queueId: string } }` (enqueues the session into the named queue)
- **Built-in `chat`**: `{ type: "chat", props: { agents?: string[] } }` (opens chat scoped to `$.user_group.chat_group_id`; if `agents` are provided the server joins them; traversal from chat occurs only when the UI issues `{ type: "next" }`; auto-advance by time is not supported in MVP)
- **Built-in `media` / `form`**: component instances for common media or form elements; props are validated at compile time when applicable.
- **Custom `component`**: `{ type: "component", props: { component: string, props: object, unknownEvents?: "error" | "warn" | "ignore" } }`

Compilation note: at publish time the compiler normalizes top-level helpers into canonical `components` instances, validates component props against their schemas, and records resolved custom component versions for audit.

### Routing and actions

Routing is determined entirely by button actions declared on each node. Buttons must expose a stable `id` so the runtime can resolve the definition when a client sends an event.

- `action.type` must currently be `"go_to"`.
- `target` (string) is the destination node id when no conditional branch matches.
- `branches` (array) contains ordered rules. Each branch provides a required `target` and an optional `when` condition. Branches are evaluated in config order; the first branch whose condition evaluates truthy is taken. A branch without `when` acts as the default.

Conditions reuse the DSL expression language. They evaluate against the runtime context:

- `$event.payload` reads the payload provided by the client for the triggering button press.
- `$user_state` reads the authoritative participant state.
- `$run` reads transient session data (e.g., `currentNodeId`).

Configs must supply either a `target` or at least one branch. If resolution fails at runtime the API rejects the event.

When the client activates a button it sends `{ event: { type: "go_to", payload: { buttonId, ... } } }`. Additional payload fields (e.g., form answers) are available to branch conditions via `$event.payload.*`.

### User state schema

The `user_state` section defines the participant state types for validation and storage. Types:
- Scalars: `int`, `bool`, `string`.
- Arrays: `{ type: array, items: <type or object schema> }`.
- Objects: `{ type: object, properties: { <key>: <type or schema> } }`.

Values written via `assign` must conform to the declared schema.

Defaults: Each field may specify `default`. On session creation, `user_state` is initialized with these defaults; unspecified fields are omitted until first write.

### Group state schema

- The `group_state` section defines shared group-level state persisted on the group document and exposed to each member as `$.user_group`.
- Creation and linkage:
  - A new group is created on every successful `match`. The runtime links each member session to the created `groupId` and initializes `$.user_group` for those sessions.
- Types: same as `user_state` — scalars (`int`, `bool`, `string`), arrays, and objects.
- Defaults: Each field may specify `default`. On group creation, `$.user_group` is initialized from these defaults; unspecified fields are omitted until first write.
- Write rules:
  - Only server-originating events and system code may write `$.user_group.*` (e.g., `match`, `timeout`, backfill, timers). Client-originating events cannot write `$.user_group.*`; such assignments are rejected.
- Visibility and usage: `$.user_group.*` is readable in expressions for all members and may be referenced in `when` conditions and component props.
- Reserved fields: The runtime may set reserved fields (e.g., `chat_group_id`) required by built-in components. If declared in `group_state`, they must match the declared type; otherwise they remain runtime-managed and read-only.

### Queues

Queues are server-managed waiting rooms that collect participants until enough are available to form a group. Entering a `queue` node enqueues the current session into the named queue. The runtime matches participants in FIFO order into groups of `num_users`. On a successful match it creates a `groupId`, initializes `$.user_group` for members (including `chat_group_id`), emits `match`, and continues traversal. If a participant waits beyond `timeoutSeconds` (or the server default), the runtime emits `timeout`. Optional backfill can create groups with ghost seats when enabled.

- `{ id: string, num_users: int, timeoutSeconds?: int }`
- Matching policy: FIFO by arrival time, fill groups of `num_users`. Timeout policy is configurable per queue in the config; server defaults apply when omitted.
- On match, the runtime emits `match` and writes `$.user_group.chat_group_id` and the `groupId`. On timeout, the runtime emits `timeout`.
- Default timeout: 120 seconds when `timeoutSeconds` is not set. On timeout, the runtime emits `timeout`; authors can branch by inspecting `$event.payload` or state in their button actions on the next node.

### Agents

Agents are server-hosted AI participants that can be invited into `chat` nodes. Define agents once under `agents` and reference them by id in a chat node’s `agents` list. The server resolves the provider and credentials, runs the model, and streams its messages; clients never see provider keys. Basic generation controls like `temperature` and `maxTokens` are supported; advanced `tools` and `resources` are reserved for future use.

- `{ id: string, model: string, temperature?: number, maxTokens?: number }`
- Agents are resolved server-side only. Client never sees provider keys.
  - In MVP, `tools` and `resources` are reserved and ignored.

## Expression language

Use `expr-eval` with a constrained environment and deterministic RNG.

### Roots

Roots define the top-level namespaces available to the expression evaluator. They form the context used in `when` conditions, event handlers, and component props. `$.user_state` is participant-local and writable via `assign`; `$.user_group` is shared across members of a matched group and is server-managed (clients read only); `$.env` and `$.now` are read-only.

- `$.user_state`: participant-local state, writeable via `assign`.
- `$.user_group`: group-local fields exposed to each member. Writeable only by server events like `match`. Clients cannot write `$.user_group.*`; it is read-only in expressions.
- `$.env`: read-only environment values (e.g., experiment id, config version).
- `$.now`: read-only timestamp (server time) for evaluation; do not use for randomization.

### Functions

Functions are the built-in helpers available inside expressions. Use them in `when` conditions and assignment right-hand sides for numeric, logical, string, and collection operations. `rand()` yields a deterministic value in [0,1) using the configured seed scope (experiment, group, or participant), suitable for controlled randomization.

- Numeric: `min`, `max`, `abs`, `floor`, `ceil`, `round`.
- Logical: `and`, `or`, `not`.
- Nullish: `coalesce(a, b, ...)`.
- Collections: `len(x)`, `includes(haystack, needle)`.
- Strings: `lower`, `upper`, `trim`.
- Random: `rand()` ∈ [0,1), deterministic and seeded.

### Determinism and seeds

- Seeds are derived as: `experimentSeed → groupSeed → participantSeed` using a stable KDF (e.g., HKDF-SHA256) with the public ids and role as salt/info.
- Each session persists its seeds on `experiment`, `group`, and `participant` docs.
- `rand()` is deterministic per evaluator context:
  - In edges evaluated pre-match, use `participantSeed`.
  - In group-level logic and chat nodes, use `groupSeed`.
  - All uses are recorded for audit.

## Runtime semantics

This section defines the required behavior of the engine at run time: how a run is executed step by step.

### Lifecycle

1) Load config by `publicId` → resolve `publishedConfigId` from registry.
2) Validate and compile YAML to canonical JSON with defaults and normalized shapes.
3) Create a participant session with seeds and initial `user_state` per schema defaults.
4) Enter the initial node: `initialNodeId` if provided, else the first listed in `nodes`.

### Event loop and edge selection (normative)

Normative means the ordering below is required for compliance.
1) Validate the incoming event for the current node; reject unknown or malformed events.
2) Execute `on[event]` handlers attached to outgoing edges from the current node in config order. Apply `assign` atomically; reject on type mismatch.
3) Recompute evaluation context.
4) Evaluate `when` for outgoing edges in config order (missing means true); take the first true edge.
5) Move to `edge.to`. If none match, halt with a config error.

## Validation

### Compilation

- YAML is compiled into canonical JSON with:
  - Normalized node shapes (missing optional fields default to empty forms).
  - Buttons normalized to `{ text, action }`.
  - Survey choices required for `multiple_choice` and omitted otherwise.
  - `component` nodes normalized to `{ component, props }`.

### JSON Schema coverage

- Provide schemas for: `nodes`, `user_state`, `group_state`, `queues`, `agents`, and button `action` objects.
- Pre-validate `assign` LHS paths against `user_state` schema.
 - Default `additionalProperties: false` across schemas unless explicitly opted-in to catch typos.
 - Allow `$ref` usage within schemas in-config (self-contained only; no external imports).

### Lints

- Unique ids across `nodes`, `queues`, `agents`.
- Button ids must be unique per node.
- Every `go_to` action (including each branch target) must reference an existing node.
- Types of `assign` RHS must match declared `user_state` target types.
- Forbid assignments outside `$.user_state.*` from client events.
- Unknown `action.type` values are errors.

## Storage and data model

### Registry and configs

- Firestore collections:
  - `experiments/{publicId}` → `{ publishedConfigId, owner, permissions, metadata }`.
  - `configs/{configId}` → immutable canonical JSON config, schemaVersion, createdAt, checksum.

### Sessions, groups, events

- `sessions/{sessionId}`: `{ publicId, configId, participantId, currentNodeId, user_state, seeds, startedAt, endedAt }`.
- `groups/{groupId}`: `{ queueId, numUsers, memberRunIds[], chat_group_id, seeds, arrivals, releaseToken }`.
- `events/{eventId}` (subcollection under session): event-sourced log of transitions, chat, tool calls.

### Live chat

- RTDB: `chats/{chat_group_id}` with message streams. Server enforces ACLs per group membership.

## Minimal API surface (Hono)

- `POST /sessions/start` → body: `{ publicId, participantId? }` → `{ sessionId, firstNode, initialState? }`
- `GET /sessions/{sessionId}` → `{ currentNodeId, user_state, user_group, endedAt? }`
- `GET /sessions/{sessionId}/stream` → SSE stream of passive events (e.g., `match`, `timeout`, state updates)
- `POST /sessions/{sessionId}/advance` → body: `{ event: { type, payload } }` → `{ newNode, updatedState? }`
- `POST /queues/{queueId}/enqueue` → body: `{ sessionId }` → `{ position, estimatedWait? }`
- `POST /chat/{groupId}/messages` → body: `{ text: string, role: "user" }` → 204 (response streams via SSE)
- `GET /chat/{groupId}/stream` → SSE stream of messages for the group
- `POST /agents/{agentId}/call` → server-side only invocation (body: `{ prompt, context }` → streamed response)

## Frontend and backend architecture

- **Runtime**: Node.js. Package manager: pnpm.
- **Frontend**: React, Vite, shadcn/ui, Tailwind CSS, TanStack Router/Query/Form, MDX for rich content.
- **Backend**: Hono API, Firebase Functions v2 colocated with Firestore/RTDB.
- **Storage**: Firestore (configs, sessions, groups, events), Firebase RTDB (chat).
- **Realtime**: RTDB for chat and collaboration signals.
- **AI**: Provider abstraction (OpenRouter/OpenAI/etc), streaming, tool calling opt-in, server-only keys.

## Security and observability

- **Security**: Server-authored state transitions and timers; per-doc ACLs in Firestore/RTDB; rate limits and moderation hooks on chat; PII scrubbing on logs; cost caps on AI usage.
- **Reproducibility**: Seeds persisted; randomization decisions logged with the used seed and callsite.
- **Observability**: Structured logs, metrics per experiment, distributed traces, admin controls to pause/resume and force releases.
 - **Decision auditing**: Each `rand()` use and queue outcome (`match`, `timeout`, `abandoned`) is recorded as a structured event with seed scope, callsite, and inputs/outputs.

## Appendices

### Appendix A: Custom Components (optional)

Custom components allow experimenters to extend the UI without changing the runtime. The config remains routing, data, and UI wiring only.

#### Component registry

Top-level `components` entries declare contracts that the runtime validates at publish time:

- `{ id: string, version: string, propsSchema?: JSONSchema, events?: { name: string, payloadSchema?: JSONSchema }[], capabilities?: string[] }`
- `propsSchema` and `events[*].payloadSchema` are JSON Schema subsets for validation. They document what the component expects and emits.
- `capabilities` is an allowlist for built-in affordances (e.g., `clipboard`, `fileUpload`). Network or AI access is never granted via components directly.

The frontend application may maintain a `componentRegistry` mapping `id`→implementation. If an id exists in config but not in the app registry at runtime, the run errors with a missing component. The runtime records the resolved implementation version alongside the run for audit.

#### Using a component in a node

In a node with `component`, the runtime:
- Validates `props` against `propsSchema` if provided.
- Mounts the component and subscribes to its declared `events`.
- When the component emits an event `name` with `payload`, the runtime validates the payload against `payloadSchema` and surfaces it so the experiment can map the result into a `go_to` action or state update.
  - If the component emits an event that is not declared and `unknownEvents` is "error", the event is rejected and logged; "warn" logs and drops; "ignore" silently drops.

#### Actions to component (optional)

The runtime may send simple actions to components via button `action` or timeouts. MVP omits a general action bus; components should be self-contained and emit events to drive routing.

#### Example (Custom component)

```yaml
components:
  - id: rating_widget
    version: 1.0.0
    propsSchema:
      type: object
      properties:
        max:
          type: integer
          minimum: 3
          maximum: 10
      required: [max]
      additionalProperties: false
    events:
      - name: rating_submitted
        payloadSchema:
          type: object
          properties:
            value: { type: integer, minimum: 1 }
          required: [value]

nodes:
  - id: rate
    component:
      component: rating_widget
      props:
        max: 5
      unknownEvents: error
    buttons:
      - id: rate-submit
        text: "Submit rating"
        action:
          type: go_to
          target: thanks
  - id: thanks
    end: true

user_state:
  rating: int
```

### Appendix B: Queue Backfill (optional)

Queues may optionally enable backfill to form groups using ghost seats when necessary.

- Queue config extension: `{ backfill?: { enabled: bool, policy?: "fifo", ghostAgents?: { agentId: string }[] } }`
- When backfill is used, the server writes a flag indicating ghost seats were used and emits `backfilled`.
- Auditing records `backfilled` outcomes alongside other queue outcomes.

### Appendix C: Examples

### Simple survey

A minimal survey you can upload as `your_experiment.yaml` to run a short questionnaire.

```yaml
initialNodeId: intro

nodes:
  - id: intro
    text: |
      Welcome. Please complete this short survey.
    buttons:
      - id: intro-start
        text: "Begin"
        action:
          type: go_to
          target: survey_1
  - id: survey_1
    text: "Pretend survey question"
    buttons:
      - id: survey-submit
        text: "Submit"
        action:
          type: go_to
          branches:
            - when:
                op: equals
                left: "$event.payload.choice"
                right: follow_up
              target: survey_follow_up
            - target: outro
  - id: survey_follow_up
    text: "Thanks for opting in to the follow-up."
    buttons:
      - id: follow_up_continue
        text: "Continue"
        action:
          type: go_to
          target: outro
  - id: outro
    end: true

user_state:
  choice: string
```

### Chat, Randomization, AI Agents

Here is a more sophisticated example that randomly matches humans to chat with other humans or AI.

> Legacy note: this example still references the deprecated `flow` DSL and will be updated once the routing rewrite adds equivalent capabilities.

```yaml
nodes:
  - id: intro
    text: |
      Welcome to the experiment!
      Press "Start" to begin.
    buttons:
      - text: "Start"
        action: { type: next }
  - id: start_survey
    survey:
      - id: question1
        text: "How old are you?"
        answer: numeric
      - id: question2
        text: "You like apples."
        answer: likert7
  - id: queue
    queue: default_queue
  - id: chat_control
    chat:
  - id: chat_treated
    chat:
      agents:
        - default_agent
  - id: outro
    text: "Thank you for participating in our study."
    buttons:
      - text: "Return to Prolific"
        action: { type: return_to_prolific, code: "ENTER_COMPLETION_CODE" }

flow:
  - from: intro
    to: start_survey
  - from: start_survey
    on:
      complete:
        - assign:
          "$.user_state.treated": "rand() < 0.5"
    to: queue
  - from: queue
    when: "$.user_state.treated == true"
    on:
      match: []
    to: chat_treated
  - from: queue
    when: "$.user_state.treated == false"
    on:
      match: []
    to: chat_control
  - from: chat_control
    to: outro
  - from: chat_treated
    to: outro

user_state:
  treated: bool
  chat_messages:
    type: array
    items:
      type: object
      properties:
        from: {type: string}
        text: {type: string}
        type: {type: string, const: "chat_message"}

queues:
  - id: default_queue
    num_users: 2
    timeoutSeconds: 120

agents:
  - id: default_agent
    model: "grok-4-fast-non-reasoning"
```

#### Queue timeout example

```yaml
nodes:
  - id: queue
    queue: default_queue
  - id: fallback
    text: "Sorry, we could not find a partner right now."
    buttons:
      - text: "Finish"
        action: { type: end }

flow:
  - from: queue
    on:
      timeout:
        - assign:
          "$.user_state.timed_out": true
    to: fallback

user_state:
  timed_out: bool

queues:
  - id: default_queue
    num_users: 2
    timeoutSeconds: 60
```

Note: The custom component example is provided in Appendix A.

## Compatibility and mapping notes

- The earlier design draft using state machine pages and DAG edges now maps to `nodes` with button-driven `go_to` actions.
- WaitForGroup barriers are modeled with `queue` nodes plus `match` events.
- The earlier `actions` map on activities maps to `buttons.action`.
- Seeds and determinism follow the experiment→group→participant derivation path outlined previously.


