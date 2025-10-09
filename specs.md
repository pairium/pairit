## Pairit Technical Spec

### Decision highlights

- **Scope**: Full system spec (DSL + runtime semantics + architecture + APIs + data model).
- **Expression language**: Use expr-eval with JSONPath-style roots (e.g., `$.user_state.*`) and a small standard library including a deterministic `rand()` seeded per experiment, group, and participant.

## Goals and non-goals

- **Goals**: Simple, auditable configuration-as-data for experiments; deterministic randomization; safe server-authoritative execution; reproducibility; portability across deployments; minimal frontend logic.
- **Non-goals**: Arbitrary user-provided code execution; exposing AI keys to clients; complex UI editors in this spec.

## Configuration DSL

The configuration is authored as YAML and compiled to a canonical JSON form at publish time. The schema is versioned and validated.

### Top-level structure

- **schemaVersion**: string, semantic version of the config schema, e.g., `"1.0.0"`.
- **nodes**: array of node definitions. Each node defines one page/state.
- **flow**: array of directed edges and event handlers between nodes.
- **user_state**: declarative type schema for per-participant state.
- **queues**: array of queue definitions for matching.
- **agents**: array of AI agent definitions available to chat nodes.
- **components**: optional registry of custom UI components that can be referenced by nodes.

### Nodes

Common fields across node types:
- **id**: string, unique within the config.
- Optional presentation helpers for simple pages:
  - **text**: string, markdown supported.
  - **buttons**: array of `{ text: string, action: Action }`.

Node-specific payloads (only one of these per node):
- **survey**: array of survey questions shown as a single page.
  - `{ id: string, text: string, answer: AnswerType, choices?: string[] }`
  - **AnswerType**: `numeric | likert5 | likert7 | multiple_choice`
- **queue**: string, references a queue id to enqueue the participant.
- **chat**: object, opens a chat session.
  - `agents?: string[]` list of agent ids to include. Omit for human-only chat.
  - Future-compatible fields reserved: `tabs`, `permissions`.
- **component**: object, mounts a custom component from the registry.
  - `component: string` id from top-level `components` or from the application registry.
  - `props?: object` validated against the component's declared `propsSchema`.

### Custom components

Custom components allow experimenters to extend the UI without changing the runtime. The config remains routing, data, and UI wiring only.

#### Component registry

Top-level `components` entries declare contracts that the runtime validates at publish time:

- `{ id: string, version?: string, propsSchema?: JSONSchema, events?: { name: string, payloadSchema?: JSONSchema }[], capabilities?: string[] }`
- `propsSchema` and `events[*].payloadSchema` are JSON Schema subsets for validation. They document what the component expects and emits.
- `capabilities` is an allowlist for built-in affordances (e.g., `clipboard`, `fileUpload`). Network or AI access is never granted via components directly.

The frontend application maintains a `componentRegistry` mapping `id`→implementation. If an id exists in config but not in the app registry at runtime, the run errors with a missing component.

#### Using a component in a node

In a node with `component`, the runtime:
- Validates `props` against `propsSchema` if provided.
- Mounts the component and subscribes to its declared `events`.
- When the component emits an event `name` with `payload`, the runtime validates the payload against `payloadSchema` and raises a flow event with the same name.

#### Event integration

Custom events can be handled in `flow.on` like built-in events:
- Example: `on: { rating_submitted: [ { assign: { "$.user_state.rating": "$.event.payload.value" } } ] }`.
- The runtime exposes `$.event` during an event handler with `{ name, payload }` for use in expressions.

#### Actions to component (optional)

The runtime may send simple actions to components via button `action` or timeouts. MVP omits a general action bus; components should be self-contained and emit events to drive flow.

### Flow

An ordered list of edges and associated event handlers.

- **Edge**: `{ from: string, to: string, when?: Expr, on?: EventHandlers }`
  - **from**: source node id.
  - **to**: default destination node id if the edge is taken.
  - **when**: boolean expression; the first edge in order whose `when` evaluates to true is taken. If omitted on multiple edges from the same `from`, treat as `true` and preserve order.
  - **on**: event handlers that run when a qualifying event occurs while at `from`. Handlers can also run before traversal if they set state needed by `when`.

### Event handlers

- Structure: `on: { <eventName>: Step[] }`, where `Step` is one of:
  - `assign`: `{ assign: { "<lhs JSONPath>": <Expr> } }` Left-hand side must be under `$.user_state.*` or `$.user_group.*` where permitted.
  - Future steps reserved: `function`, `emit`.

Standard events:
- **complete**: emitted by `survey` node upon successful submission.
- **match**: emitted by `queue` node when a match is formed.
- **button**: emitted by pages with `buttons` when a button is clicked; button `action` is processed immediately.
- **<custom>**: any custom event emitted by a mounted custom component (see Custom components). The runtime sets `$.event` for handler evaluation.

### Actions

Actions are strings in buttons that cause standard transitions:
- `next`: traverse the default outgoing edge from the current node.
- `end`: terminate the run.
- `return_to_prolific(CODE)`: server responds with a redirect to Prolific with the provided completion code.

### User state schema

The `user_state` section defines the participant state types for validation and storage. Types:
- Scalars: `int`, `bool`, `string`.
- Arrays: `{ type: array, items: <type or object schema> }`.
- Objects: `{ type: object, properties: { <key>: <type or schema> } }`.

Values written via `assign` must conform to the declared schema.

### Queues

- `{ id: string, num_users: int }`
- Matching policy: FIFO by arrival time, fill groups of `num_users`. Timeout and backfill policies are server-configurable per queue (defaults documented below).
- On match, the runtime emits `match` and writes `$.user_group.chat_group_id` and the `match_id`.

### Agents

- `{ id: string, model: string, temperature?: number, maxTokens?: number, topP?: number, tools?: string[], resources?: object, promptTemplate?: string }`
- Agents are resolved server-side only. Client never sees provider keys.

## Expression language

Use expr-eval with a constrained environment and deterministic RNG.

### Roots

- `$.user_state`: participant-local state, writeable via `assign`.
- `$.user_group`: group-local fields exposed to each member. Writeable only by server events like `match`.
- `$.env`: read-only environment values (e.g., experiment id, config version).
- `$.now`: read-only timestamp (server time) for evaluation; do not use for randomization.

### Functions

- Numeric: `min`, `max`, `abs`, `floor`, `ceil`, `round`.
- Logical: `and`, `or`, `not`.
- Nullish: `coalesce(a, b, ...)`.
- Collections: `len(x)`, `includes(haystack, needle)`.
- Strings: `lower`, `upper`, `trim`.
- Random: `rand()` ∈ [0,1), deterministic and seeded.

### Determinism and seeds

- Seeds are derived as: `experimentSeed → groupSeed → participantSeed` using a stable KDF (e.g., HKDF-SHA256) with the public ids and role as salt/info.
- Each run persists its seeds on `experiment`, `group`, and `participant` docs.
- `rand()` is deterministic per evaluator context:
  - In edges evaluated pre-match, use `participantSeed`.
  - In group-level logic and chat nodes, use `groupSeed`.
  - All uses are recorded for audit.

### Assignments

- Only `$.user_state.*` is assignable from expressions in client-originating events.
- Server-originating events may write to `$.user_group.*` and system-managed fields.
- Type checks happen before writes; invalid writes are rejected and logged.
- During custom event handling, `$.event` is read-only and includes `{ name: string, payload: any }`.

## Runtime semantics

### Lifecycle

1) Load config by `publicId` → resolve `publishedConfigId` from registry.
2) Validate and compile YAML to canonical JSON with defaults and normalized shapes.
3) Create a participant run with seeds and initial `user_state` per schema defaults.
4) Enter the first node (the first listed in `nodes`).

### Edge traversal

- For the current node, collect all outgoing edges where `edge.from == current` in config order.
- Evaluate `when` for each edge using the current evaluation context.
- Take the first edge whose `when` is true. If no `when` specified, treat as true.
- If no edge is valid, this is a config error; runtime logs and halts the run.

### Events and page behavior

- **Survey node**: On submit, validate answers, write to `$.user_state` under their `id`, emit `complete`, then traverse.
- **Queue node**: Enqueue participant into `queue.id`. When a group is formed of `num_users`, the server creates a `match_id`, writes `$.user_group.chat_group_id` for members, emits `match`, then traverses based on matching edges.
- **Chat node**: Open a session scoped to `chat_group_id`. If `agents` provided, the server joins specified agents. Messages stream via RTDB. Traversal occurs when the UI issues a `next` or time-based rule triggers.
- **Buttons**: On click, process `action`. `next` triggers traversal immediately; `end` completes run; `return_to_prolific(code)` issues a redirect.

### Queue policies

- Default timeout: 120 seconds. On timeout, the server may backfill with ghost AI seats or route to an alternate path if configured in flow.
- Backfill is optional and server-controlled; when used, the server writes a flag indicating ghost seats were used.

## Validation and canonicalization

### Compilation

- YAML is compiled into canonical JSON with:
  - Normalized node shapes (missing optional fields default to empty forms).
  - Buttons normalized to `{ text, action }`.
  - Survey choices required for `multiple_choice` and omitted otherwise.
  - `component` nodes normalized to `{ component, props }`.

### JSON Schema coverage

- Provide schemas for: `nodes`, `flow`, `user_state`, `queues`, `agents`.
- Pre-validate `assign` LHS paths against `user_state` schema.
- Validate `components[*]` contracts and that `nodes[*].component` references a declared component id (or mark as external to be resolved by the app registry).

### Lints

- Unique ids across `nodes`, `queues`, `agents`.
- All `flow.from` and `flow.to` must reference existing nodes.
- At least one outgoing edge for each node unless terminal.
- No unreachable nodes.
- Types of `assign` RHS must match declared `user_state` target types.
- Forbid assignments outside `$.user_state.*` from client events.
- Component usage checks: missing `props` keys, extra keys not allowed by `propsSchema` (when `additionalProperties: false`), unknown custom events in `on` sections.

## Storage and data model

### Registry and configs

- Firestore collections:
  - `experiments/{publicId}` → `{ publishedConfigId, owner, permissions, metadata }`.
  - `configs/{configId}` → immutable canonical JSON config, schemaVersion, createdAt, checksum.

### Runs and groups

- `runs/{runId}`: `{ publicId, configId, participantId, currentNodeId, user_state, seeds, startedAt, endedAt }`.
- `groups/{groupId}`: `{ queueId, numUsers, memberRunIds[], chat_group_id, seeds, arrivals, releaseToken }`.
- `events/{eventId}` (subcollection under run): event-sourced log of transitions, chat, tool calls.

### Live chat

- RTDB: `chats/{chat_group_id}` with message streams. Server enforces ACLs per group membership.

## Minimal API surface (Hono)

- `POST /runs/start` → body: `{ publicId }` → `{ runId, firstNode }`
- `POST /runs/{runId}/advance` → body: `{ event: { type, payload } }` → `{ newNode }`
- `POST /queues/{queueId}/enqueue` → `{ runId }` → `{ position }`
- `GET /chat/{groupId}/stream` → SSE stream of messages for the group
- `POST /agents/{agentId}/call` → server-side only invocation (no client keys)

## Frontend and backend architecture

- **Runtime**: Node.js. Package manager: pnpm.
- **Frontend**: React, Vite, shadcn/ui, Tailwind CSS, TanStack Router/Query/Form, MDX for rich content.
- **Backend**: Hono API, Google Cloud Functions (2nd gen) colocated with Firestore/RTDB.
- **Storage**: Firestore (configs, runs, groups, events), Firebase RTDB (chat).
- **Realtime**: RTDB for chat and collaboration signals.
- **AI**: Provider abstraction (OpenRouter/OpenAI/etc), streaming, tool calling opt-in, server-only keys.
 - **Component registry**: Frontend exports `componentRegistry: Record<string, ReactComponent>`; config `components` must map to implementations present at build time (or loaded via a signed plugin mechanism in a future version). Props are validated client-side before mount.

## Security and observability

- **Security**: Server-authored state transitions and timers; per-doc ACLs in Firestore/RTDB; rate limits and moderation hooks on chat; PII scrubbing on logs; cost caps on AI usage.
- **Reproducibility**: Seeds persisted; randomization decisions logged with the used seed and callsite.
- **Observability**: Structured logs, metrics per experiment, distributed traces, admin controls to pause/resume and force releases.
 - **Custom components security**: No direct network, filesystem, or AI access from components. All side effects occur via emitting events handled by server-authoritative flow transitions and API calls originating from the runtime.

## Examples

### Simple survey

A minimal survey you can upload as `your_experiment.yaml` to run a short questionnaire.

```yaml
nodes:
  - id: intro
    text: |
      Welcome. Please complete this short survey.
    buttons:
      - text: "Begin"
        action: next
  - id: survey_1
    survey:
      - id: age
        text: "What is your age?"
        answer: numeric
      - id: gender
        text: "What is your gender?"
        answer: multiple_choice
        choices:
          - Male
          - Female
          - Other
          - Prefer not to say
      - id: satisfaction
        text: "How satisfied are you with our service?"
        answer: likert5
  - id: outro
    text: "Thank you for completing the survey."
    buttons:
      - text: "Finish"
        action: end

flow:
  - from: intro
    to: survey_1
  - from: survey_1
    to: outro

user_state:
  age: int
  gender: string
  satisfaction: int
```

### Chat, Randomization, AI Agents

Here is a more sophisticated example that randomly matches humans to chat with other humans or AI.

```yaml
nodes:
  - id: intro
    text: |
      Welcome to the experiment!
      Press "Start" to begin.
    buttons:
      - text: "Start"
        action: next
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
    button:
      - text: "Return to Prolific"
        action: "return_to_prolific(ENTER_COMPLETION_CODE)"

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
      match:
        - assign:
          "$.user_group.chat_group_id": "match_id"
    to: chat_treated
  - from: queue
    when: "$.user_state.treated == false"
    on:
      match:
        - assign:
          "$.user_group.chat_group_id": "match_id"
    to: chat_control
  - from: chat_control
    to: outro
  - from: chat_treated
    to: outro

user_state:
  treated: bool
  chat_group_id: int
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

agents:
  - id: default_agent
    model: "grok-4-fast-non-reasoning"
```

### Custom component example

```yaml
components:
  - id: rating_widget
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
  - id: thanks
    text: "Thanks for your rating!"
    buttons:
      - text: "Finish"
        action: end

flow:
  - from: rate
    on:
      rating_submitted:
        - assign:
          "$.user_state.rating": "$.event.payload.value"
    to: thanks

user_state:
  rating: int
```

## Compatibility and mapping notes

- The earlier design draft using state machine pages and DAG edges maps directly to `nodes` and `flow` here.
- WaitForGroup barriers are modeled with `queue` nodes plus `match` events.
- The earlier `actions` map on activities maps to `buttons.action` and `on: { button }` where needed.
- Seeds and determinism follow the experiment→group→participant derivation path outlined previously.


