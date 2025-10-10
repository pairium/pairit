## Pairit

### Overview

- Purpose: A minimal runtime that connects a single-file YAML config to a React UI using three primitives:
  1) UI runtime glue (component registry + renderer)
  2) Authoritative data store (`user_state`)
  3) Routing (button-driven navigation)
- Special capabilities: queues (matching), chat (group-scoped RTDB), agents (server-hosted participants)
- Scope: DSL + runtime semantics + minimal APIs + data model
- Goals: tiny and auditable glue; deterministic randomization; server-authoritative state; portability; minimal frontend logic
- Non-goals: arbitrary client code execution; exposing AI keys; complex visual editors
- Constraints: single-file config per environment; no imports
- Expression language: `expr-eval`-style with JSONPath roots (e.g., `$.user_state.*`) and a small standard library including deterministic `rand()` seeded per experiment, group, and participant

## Architecture

- **Frontend**: React, Vite, shadcn, Tailwind CSS, TanStack Router/Query/Form, MDX.
- **Backend**: Hono API, Firebase Functions 0.0.1 near Firestore/RTDB.
- **Parser**: Node.js. Package manager: pnpm.
- **Experiment manager**: Node.js utility that turns parser output into Firestore updates.
- **Storage**: Firestore (configs, sessions, groups, events), RTDB (chat).
- **Realtime**: RTDB for chat/collab signals.
- **AI**: Provider abstraction (server-only keys), streaming, optional tools.

## Runtime

The lightweight runtime layer exposes three primitives that connect the compiled config to React:

1) UI renderer
2) Data store
3) Routing

### 1) UI Renderer

Purpose: map a config page to a registered React component and wire button descriptors to runtime actions.

```tsx
import { componentRegistry } from './registry';

export function renderPage(page, context) {
  const Component = componentRegistry[page.componentType] ?? componentRegistry.default;
  const props = enrichWithActions(page.props, page.buttons, context);
  return <Component {...props} />;
}
```

Registry shape (app-level):

```ts
export const componentRegistry = {
  text: TextBlock,
  buttons: ButtonsRow,
  survey: SurveyForm,
  queue: QueuePanel,
  chat: ChatView,
  media: MediaBlock,
  form: GenericForm,
  component: CustomComponentHost, // mounts custom components by id
  default: FallbackComponent,
};
```

Example of the yaml config:

```yaml
page:
  title: "Signup"
  sections:
    - component: "TextBlock"
      props:
        text: "Welcome!"
    - component: "EmailInput"
      props:
        placeholder: "Enter your email"
    - component: "ButtonBar"
      props:
        buttons:
          - id: "continue"
            label: "Continue"
            action:
              type: "PROCEED"
              payload: { step: 2 }
          - id: "back"
            label: "Back"
            action:
              type: "NAVIGATE_BACK"
```

### 2) Data store

Principle: all study data lives in `user_state` as declared in YAML. The client exposes a tiny context with read/write helpers; the server validates and persists.

Client API (minimal):

```ts
type UserState = Record<string, any>;

const UserStateContext = React.createContext({
  state: {} as UserState,
  assign: (path: string, value: any) => Promise.resolve<void>(undefined),
  bulkAssign: (patch: Record<string, any>) => Promise.resolve<void>(undefined),
});

export function useUserState() {
  return React.useContext(UserStateContext);
}
```

YAML schema example:

```yaml
user_state:
  age: int
  consent: bool
  sleep_hours:
    type: int
    default: 8
  survey_answers:
    type: object
    properties:
      q1: { type: string }
      q2: { type: integer }
    additionalProperties: true
```

Server validates `assign` against this schema and rejects mismatches. Right-hand sides may be expressions; see "Expression evaluation (routing)".

#### Group-level shared state (`group_state`)

- Shared fields persisted on the group document; exposed to sessions as `$.user_group`.
- Lifecycle: created after a successful `match` from a `queue`. Runtime links each member session to `groupId` and initializes `$.user_group`.
- Types: same as `user_state` (scalars: `int`, `bool`, `string`); includes arrays and objects.
- Defaults: initialize `$.user_group` from declared defaults; unspecified fields are omitted until first write.
- Write rules: only server-originating events and system code may write `$.user_group.*` (e.g., `match`, `timeout`, backfill, timers); client writes are rejected.
- Visibility: `$.user_group.*` is readable in expressions and may be referenced in `when` and component props.
- Reserved fields: runtime may set reserved fields (e.g., `chat_group_id`) required by built-in components. If declared in `group_state`, they must match the declared type; otherwise they are runtime-managed and read-only.

#### Persistence and data model

- Registry and configs (Firestore):
  - `experiments/{publicId}` → `{ publishedConfigId, owner, permissions, metadata }`.
  - `configs/{configId}` → immutable canonical JSON config, schemaVersion, createdAt, checksum.
- Sessions and groups (Firestore):
  - `sessions/{sessionId}`: `{ publicId, configId, participantId, currentPageId, user_state, seeds, startedAt, endedAt }`.
  - `groups/{groupId}`: `{ queueId, numUsers, memberRunIds[], chat_group_id, seeds, arrivals, releaseToken }`.
  - `events/{eventId}` (subcollection under session): event-sourced log of transitions, chat, tool calls.

### 3) Routing

Principle: keep one `currentPageId` and a single `advance(event)` that resolves branches with the expression evaluator against `{ $event, $user_state, $run }`. See "Expression evaluation (routing)".

Minimal routing context:

```ts
const RoutingContext = React.createContext({
  currentPageId: null,
  advance: async (event: { type: string; payload?: any }) => {},
});

export function useRouting() {
  return React.useContext(RoutingContext);
}

function resolveBranch(action, context) {
  if (!action.branches || action.branches.length === 0) return action.target;
  for (const b of action.branches) {
    if (!b.when) return b.target; // default branch
    const truthy = evaluate(b.when, context); // context: { $event, $user_state, $run }
    if (truthy) return b.target;
  }
  throw new Error('No branch matched and no default provided');
}
```

Client calls `advance`, server authoritatively applies effects and returns `{ newNode, updatedState }`.

YAML button example (routing-only):

```yaml
buttons:
  - id: next
    text: "Next"
    action:
      type: go_to
      target: outro
```

#### Expression evaluation

Used to evaluate branch conditions (`when`) and computed assignment right-hand sides. Format: string expressions only. Object-style expressions are not supported.

- Context roots:
  - `$event` (typically `$event.payload.*` from the triggering button)
  - `$.user_state` (participant-local, writable via `assign`)
  - `$.user_group` (group-local, server-managed; read-only to clients)
  - `$.env`, `$.now` (read-only; `$.now` is not for randomness)
  - `$.run` (transient session data such as `currentPageId`)
- Functions (whitelisted): numeric (`min`, `max`, `abs`, `floor`, `ceil`, `round`), logical (`and`, `or`, `not`), nullish (`coalesce`), collections (`len`, `includes`), strings (`lower`, `upper`, `trim`), and `rand()` ∈ [0,1) only.
- Determinism and seeds: experimentSeed → groupSeed → participantSeed (e.g., HKDF). Pre-match uses participantSeed; group contexts use groupSeed. All uses are auditable.
- Types: DSL uses `int`, `bool`, `string`. JSON Schema for custom components uses `integer`, `boolean`, `string`.

#### Session lifecycle

1) Load config by `publicId` → resolve `publishedConfigId` from registry.
2) Validate and compile YAML to canonical JSON with defaults and normalized shapes.
3) Create a participant session with seeds and initial `user_state` per schema defaults.
4) Enter the initial node: `initialNodeId` if provided, else the first listed in `nodes`.

#### Event handling semantics

1) Validate the incoming event for the current node. Unknown or malformed events MUST be rejected.
2) Resolve the triggering button by `payload.buttonId`. Missing or unknown `buttonId` MUST be rejected.
3) Apply `action.assign` atomically to `$.user_state` (server-side). Schema/type mismatches MUST be rejected.
4) Recompute evaluation context.
5) Evaluate `action.branches` in order. The first truthy `when` wins. A branch without `when` is the default and SHOULD be last.
6) If no branch matches and no default exists, the runtime MUST error; otherwise set `currentPageId` to the selected target. Missing targets are config errors and MUST halt the run.

## Experiment manager

- **Role**: consume the parser output and push canonical configs into Firestore so the runtime can fetch immutable builds.
- **Firestore layout**: store configs inside the existing `tools` collection at `tools/{toolId}/experiments/{configId}` with the same canonical JSON format used by `configs/{configId}`.
- **Operations**: expose `uploadConfig` that accepts YAML, invokes the parser to produce canonical JSON, writes metadata plus checksum, and return the Firestore document id. Expose `deleteConfig(configId)` that removes the experiment document from the same path and leaves published runs untouched.
- **Auth**: skip authentication for the MVP. Access control will follow once tooling hardens and workflows land.
- **Failure handling**: bubble parser validation errors as structured responses and treat Firestore write failures as retryable errors surfaced to the caller.

## Configuration DSL

The configuration is authored as YAML and compiled to canonical JSON at publish time. The schema is versioned and validated. Nodes describe UI; buttons describe actions; `user_state` describes data.

### Top-level structure

- **schema_version**: string (e.g., `"0.0.1"`).
- **initialNodeId**: string, first node id.
- **nodes**: array of node definitions (one page/state each).
- **user_state**: declarative type schema for per-participant state (centerpiece data store).
- **group_state**: optional shared state schema (server-managed).
- **queues**: optional queue definitions for matching.
- **agents**: optional AI agent definitions for chat.

### Versioning

- `schema_version`: string (e.g., "0.0.1"). The compiler MUST reject unknown versions.
- Published configs are immutable. New edits create new `configId`s.

### Nodes

Nodes declare which components appear on a page and which buttons can be activated to move to the next page. Built-in components include `text`, `buttons`, `survey`, `queue`, `chat`, `media`, and `form`. Custom components are mounted via the component registry (Appendix A).

Common fields on a node:
- **id**: string, unique within the config.
- **end?**: boolean, when true the node is terminal and ends the session upon entry. Outgoing edges from an `end` node are invalid.
- **components?**: array of component instances shown on the page (canonical). Each instance is either a built-in component or a `component` reference to a registered custom component.
- **layout?**: optional layout metadata or presentation hints for the client (non-normative; used by the frontend for spacing/columns/etc).

For convenience, simple top-level helpers remain supported and are normalized at compile time into `components`:
- **text**: string (markdown supported) -> normalized to a `text` component instance.
- **buttons**: array of `{ text: string, action: Action }` -> normalized to a `buttons` component instance.
 - Single-component shorthand: a node may define `componentType`, `props`, and `buttons` at the top level for the common case of a single component per page. The compiler normalizes this into a single entry in `components` with a trailing `buttons` instance when present.

Component instance shapes (canonical):
- **Built-in `text`**: `{ type: "text", props: { text: string, markdown?: bool } }`
- **Built-in `buttons`**: `{ type: "buttons", props: { buttons: [ { text: string, action: Action } ] } }`
- **Built-in `survey`**: `{ type: "survey", props: { questions: [ { id: string, text: string, answer: AnswerType, choices?: string[] } ] } }` (on submit, validates answers, writes to `$.user_state` keyed by question `id`)
- **Built-in `queue`**: `{ type: "queue", props: { queueId: string } }` (enqueues the session into the named queue)
- **Built-in `chat`**: `{ type: "chat", props: { agents?: string[] } }` (opens chat scoped to `$.user_group.chat_group_id`; if `agents` are provided the server joins them; traversal from chat occurs only when the UI issues `{ type: "next" }`; auto-advance by time is not supported in MVP)
- **Built-in `media` / `form`**: component instances for common media or form elements; props are validated at compile time when applicable.
- **Custom `component`**: `{ type: "component", props: { component: string, props: object, unknownEvents?: "error" | "warn" | "ignore" } }`

Compilation note: at publish time the compiler normalizes helpers into canonical `components`, validates props against schemas, and records resolved custom component versions for audit.

### Routing and actions

Routing is determined by button actions declared on each node. Buttons must expose a stable `id` so the runtime can resolve the definition when a client sends an event.

- `action.type` is currently `"go_to"`.
- `assign?` (array) optional assignments to `$.user_state.*`, applied atomically before branch evaluation. Shape: `{ path: string, value: <expression or literal> }`.
- `target` (string) is the destination node id when no conditional branch matches.
- `branches` (array) are ordered rules. Each branch has a `target` and optional `when`. The first truthy branch wins. A branch without `when` acts as default.

Conditions reuse the expression language. They evaluate against the runtime context:

- `$event.payload` reads the payload provided by the client for the triggering button press.
- `$user_state` reads the authoritative participant state.
- `$run` reads transient session data (e.g., `currentPageId`).

Configs MUST supply either a `target` or at least one branch. If branches exist and none match and no default is provided, the runtime MUST error. Client events for `type: "go_to"` MUST include `payload.buttonId` referencing a declared button id on the current node.

When the client activates a button it sends `{ event: { type: "go_to", payload: { buttonId, ... } } }`. Additional payload (e.g., answers) is available in `$event.payload.*`.

Minimal YAML example (components form):

```yaml
schema_version: 0.0.1
initialNodeId: q1

nodes:
  - id: q1
    components:
      - type: text
        props:
          text: "How did you sleep last night?"
      - type: survey
        props:
          questions:
            - id: sleep_hours
              text: "Hours slept"
              answer: numeric
      - type: buttons
        props:
          buttons:
            - id: submit
              text: "Submit"
              action:
                type: go_to
                branches:
                  - when: "$event.payload.sleep_hours < 5"
                    target: short_sleep_followup
                  - target: outro
  - id: short_sleep_followup
    text: "Thanks for the info. A few follow-ups..."
    buttons:
      - id: continue
        text: "Continue"
        action: { type: go_to, target: outro }
  - id: outro
    end: true

user_state:
  sleep_hours:
    type: int
    default: 8
```

Single-component shorthand example with `assign` on the button action:

```yaml
schema_version: 0.0.1
initialNodeId: consent

nodes:
  - id: consent
    componentType: text
    props:
      text: "I agree to participate."
    buttons:
      - id: agree
        text: "I Agree"
        action:
          type: go_to
          assign:
            - path: "$.user_state.consent"
              value: true
          target: intro
  - id: intro
    text: "Welcome!"
    buttons:
      - id: next
        text: "Next"
        action: { type: go_to, target: outro }
  - id: outro
    end: true

user_state:
  consent: bool
```

## Special capabilities

### Queues

Queues are server-managed waiting rooms that collect participants until enough are available to form a group. Entering a `queue` node enqueues the current session into the named queue. The runtime matches participants FIFO into groups of `num_users`. On match it creates a `groupId`, initializes `$.user_group` (including `chat_group_id`), emits `match`, and continues. If waiting exceeds `timeoutSeconds` (or default), the runtime emits `timeout`. Optional backfill may create groups with ghost seats when enabled.

- `{ id: string, num_users: int, timeoutSeconds?: int }`
- Matching policy: FIFO by arrival time, fill groups of `num_users`. Timeout policy is configurable per queue in the config; server defaults apply when omitted.
- On match: emit `match`, write `$.user_group.chat_group_id` and `groupId`.
- On timeout: emit `timeout`.
- Default `timeoutSeconds`: 120 when unset. Authors branch on outcomes via the next node’s button action conditions.

See Data store ("Group-level shared state") for `group_state` schema and write rules. Queue outcomes drive Routing via emitted `match`/`timeout` events and initialize Chat via `chat_group_id`.

### Chat

Chat sessions are scoped to a matched group and surfaced via the built-in `chat` component.

- Scope: each group has a `chat_group_id` written to `$.user_group.chat_group_id` on match.
- Transport: RTDB channel `chats/{chat_group_id}` for message streams; server enforces ACLs by group membership.
- API: `POST /chat/{groupId}/messages` to send, `GET /chat/{groupId}/stream` for SSE.
- Agents: when a chat node lists `agents`, the server joins them to the group chat and streams their messages.
- Moderation: server-side hooks can filter/redact messages before fan-out; clients never see provider keys.

### Agents

Agents are server-hosted AI participants that can be invited into `chat` nodes. Define agents once under `agents` and reference them by id in a chat node’s `agents` list. The server resolves the provider and credentials, runs the model, and streams its messages; clients never see provider keys. Basic generation controls like `temperature` and `maxTokens` are supported; advanced `tools` and `resources` are reserved for future use.

- `{ id: string, model: string, temperature?: number, maxTokens?: number }`
- Agents are resolved server-side only. Client never sees provider keys.
  - In MVP, `tools` and `resources` are reserved and ignored.

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

## Minimal API surface (Hono)

- `POST /sessions/start` → `{ publicId, participantId? }` → `{ sessionId, firstNode, initialState? }`
- `GET /sessions/{sessionId}` → `{ currentPageId, user_state, user_group, endedAt? }`
- `POST /sessions/{sessionId}/advance` → `{ event: { type, payload } }` → `{ newNode, updatedState? }`
- `GET /sessions/{sessionId}/stream` → SSE stream of passive events (e.g., `match`, `timeout`, state updates)
- `POST /queues/{queueId}/enqueue` → `{ sessionId }` → `{ position, estimatedWait? }`
- `POST /chat/{groupId}/messages` → `{ text: string, role: "user" }` → 204 (response streams via SSE)
- `GET /chat/{groupId}/stream` → SSE stream of messages for the group
- `POST /agents/{agentId}/call` → server-side only invocation (streamed)

### Error model

- Errors return `4xx` or `5xx` with JSON: `{ code: string, message: string, details?: object }`.
- Example codes: `invalid_event`, `unknown_button`, `schema_mismatch`, `unknown_node`, `forbidden_write`, `not_found`, `internal`.

## Appendices

### Appendix A: Custom Components (optional)

Custom components allow experimenters to extend the UI without changing the runtime. The config remains routing, data, and UI wiring only.

#### Component registry

Top-level `components` entries declare contracts that the runtime validates at publish time:

- `{ id: string, version: string, propsSchema?: JSONSchema, events?: { name: string, payloadSchema?: JSONSchema }[], capabilities?: string[] }`
- `propsSchema` and `events[*].payloadSchema` are JSON Schema subsets for validation. They document what the component expects and emits.
- `capabilities` is an allowlist for built-in affordances (e.g., `clipboard`, `fileUpload`). Network or AI access is never granted via components directly.

The frontend application may maintain a `componentRegistry` mapping `id`→implementation. If an id exists in config but not in the app registry at runtime, the run MUST error with `missing_component`. The runtime records the resolved implementation version alongside the run for audit. Unless specified, `unknownEvents` defaults to `error`.

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
            - when: "$event.payload.choice == 'follow_up'"
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


