# Pairit

## Overview

Pairit is a platform for running human-AI experiments.

As an experimenter, you can create a single-file YAML config that configures your entire experiment and deploy it to run on Prolific. You can create anything from a simple survey to complex randomizations with live chat and AI agents. If you don't find a UI component that you need, you can create custom components that meet your needs.

Pairit is a light runtime that runs an experiment configuration on top of a React app with pre-made components and a simple Node backend with Firestore. The runtime consists of a UI renderer, a data schema, and routing logic. Beyond the runtime, Pairit supports match-making, live chats, live collaborations, and AI agents.

You can upload your config file to our service or deploy your own service. When you are done with an experiment, you can download the experiment data and analyze it.

## Architecture

1. **[Runtime](#runtime)**: YAML file for runtime configuration.
2. **[CLI](#cli)**: Node.js utility that lints, parses, uploads, and deletes experiment configurations on Firestore. It alse lets you download the data after you finish.
3. **[Frontend](#frontend)**: React, Vite, shadcn, Tailwind CSS, TanStack Router/Query/Form, MDX.
4. **[Backend](#backend)**: Hono API, Firebase Functions v2 near Firestore/RTDB, `expr-eval` subset.
5. **[Storage](#storage)**: Firestore (configs, sessions, groups, events), RTDB (chat).
6. **[Realtime](#realtime)**: RTDB for real-time chat and collaboration.
7. **[AI](#ai)**: Provider abstraction (server-only keys), streaming, optional tools.

## <a href="#runtime">Runtime</a>

The lightweight runtime layer exposes three primitives that connect the compiled config to React:

1) [UI renderer](#ui-renderer)
2) [Routing](#routing)
3) [Data store](#data-store)

### UI Renderer
<a href="#ui-renderer"></a>

The UI renderer maps a config page to a registered React component and wire button descriptors to runtime actions.

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
    - component: "Button"
      props:
        id: "continue"
        label: "Continue"
        action:
          type: "PROCEED"
          payload: { step: 2 }
```

The frontend renders each component like this:

```tsx
import { componentRegistry } from './registry';

export function renderPage(page, context) {
  const Component = componentRegistry[page.componentType] ?? componentRegistry.default;
  const props = parseProps(page.props);
  return <Component {...props} />;
}

export const componentRegistry = {
  text: TextBlock,
  buttons: ButtonsRow,
  button: Button,
  survey: SurveyForm,
  queue: QueuePanel,
  chat: ChatView,
  media: MediaBlock,
  form: GenericForm,
  custom_component: YourCustomComponentHost,
  default: FallbackComponent,
};
```

#### Conditional Rendering

In online experiments, you need conditional rendering. Pairit uses `expr-eval` to express the logic for rendering UI components.

```yaml
# Example: component-level conditional rendering using `when` on components
pages:
  - id: sleep_q
    components:
      - type: text
        props:
          text: "How many hours did you sleep last night?"

      - type: survey
        props:
          questions:
            - id: sleep_hours
              text: "Hours slept"
              answer: numeric

      # Conditional component: only shown when user_state.sleep_hours < 5
      - type: text
        when: "$.user_state.sleep_hours < 5"
        props:
          text: "We're sorry to hear that. Can you tell us what woke you up?"

      - type: buttons
        props:
          buttons:
            - id: submit_sleep
              text: "Submit"
              action: { type: go_to, target: outro }

  - id: outro
    end: true

# Notes:
# - Use `when` on component instances to perform conditional rendering inside a page.
# - Expressions are plain strings evaluated by the expr-eval subset against context: $event, $.user_state, $.user_group, $.env, $.now, $.run.
# - Whitelisted functions: min, max, abs, floor, ceil, round, and, or, not, coalesce, len, includes, lower, upper, trim, rand
```

#### Pages

Pages declare which components appear on a page and which buttons can be activated to move to the next page. Built-in components include `text`, `buttons`, `survey`, `queue`, `chat`, `media`, and `form`. Custom components are mounted via the component registry (Appendix A).

Common fields on a page:
- **id**: string, unique within the config.
- **end?**: boolean, when true the page is terminal and ends the session upon entry. Outgoing edges from an `end` node are invalid.
- **components?**: array of component instances shown on the page (canonical). Each instance is either a built-in component or a `component` reference to a registered custom component.
- **layout?**: optional layout metadata or presentation hints for the client (non-normative; used by the frontend for spacing/columns/etc).

For convenience, simple top-level helpers remain supported and are normalized at compile time into `components`:
- **text**: string (markdown supported) -> normalized to a `text` component instance.
- **buttons**: array of `{ text: string, action: Action }` -> normalized to a `buttons` component instance.
 - Single-component shorthand: a page may define `componentType`, `props`, and `buttons` at the top level for the common case of a single component per page. The compiler normalizes this into a single entry in `components` with a trailing `buttons` instance when present.

Component instance shapes (canonical):
- **Built-in `text`**: `{ type: "text", props: { text: string, markdown?: bool } }`
- **Built-in `buttons`**: `{ type: "buttons", props: { buttons: [ { text: string, action: Action } ] } }`
- **Built-in `survey`**: `{ type: "survey", props: { questions: [ { id: string, text: string, answer: AnswerType, choices?: string[] } ] } }` (on submit, validates answers, writes to `$.user_state` keyed by question `id`)
- **Built-in `queue`**: `{ type: "queue", props: { queueId: string } }` (enqueues the session into the named queue)
- **Built-in `chat`**: `{ type: "chat", props: { agents?: string[] } }` (opens chat scoped to `$.user_group.chat_group_id`; if `agents` are provided the server joins them; traversal from chat occurs only when the UI issues `{ type: "next" }`; auto-advance by time is not supported in MVP)
- **Built-in `media` / `form`**: component instances for common media or form elements; props are validated at compile time when applicable.
- **Custom `component`**: `{ type: "component", props: { component: string, props: object, unknownEvents?: "error" | "warn" | "ignore" } }`

Compilation note: at publish time the compiler normalizes helpers into canonical `components`, validates props against schemas, and records resolved custom component versions for audit.

### <a href="#routing">Routing</a>

The runtime uses the config to determine routing between pages.

When a participant begins an experiment, Pairit generates a session. Each session maintains a `currentPageId`. The routing in the config modifies the `currentPageId` and updates the UI.

YAML button example (routing-only):

```yaml
buttons:
  - id: next
    text: "Next"
    action:
      type: route
      target: outro
```

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

To use conditional routing, we use `expr-eval`. For example:

```yaml

# Example: show a follow-up question only when user reported < 5 hours sleep
nodes:
  - id: sleep_q
    components:
      - type: text
        props:
          text: "How many hours did you sleep last night?"
      - type: survey
        props:
          questions:
            - id: sleep_hours
              text: "Hours slept"
              answer: numeric
      - type: buttons
        props:
          buttons:
            - id: submit_sleep
              text: "Submit"
              action:
                type: go_to
                branches:
                  - when: "$.user_state.sleep_hours < 5"
                    target: short_sleep_followup
                  - target: outro

  - id: short_sleep_followup
    components:
      - type: text
        props:
          text: "We're sorry to hear that. Can you tell us what woke you up?"
      - type: buttons
        props:
          buttons:
            - id: continue
              text: "Continue"
              action: { type: go_to, target: outro }

  - id: outro
    end: true

# Notes:
# - Expressions are plain strings evaluated by the expr-eval subset.
# - Context roots available: $event, $.user_state, $.user_group, $.env, $.now, $.run
# - Whitelisted functions: min, max, abs, floor, ceil, round, and, or, not, coalesce, len, includes, lower, upper, trim, rand
```

### <a href="#data-store">Data store</a>

Any sessions or UI-triggered events get linked to this user store.

If you want to enable conditional routing based on user actions later in the experiment, you can define a schema that describes how routing should work.

**Note**: Not sure if we need this...

YAML schema example:

```yaml
user_store:
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

Client API:

```ts
type UserStore = Record<string, any>;

const UserStoreContext = React.createContext({
  state: {} as UserStore,
  assign: (path: string, value: any) => Promise.resolve<void>(undefined),
  bulkAssign: (patch: Record<string, any>) => Promise.resolve<void>(undefined),
});

export function useUserStore() {
  return React.useContext(UserStoreContext);
}
```

## <a href="#cli">CLI</a>

As an experimenter, you can use the cli to lint, parse, simulate, publish, and delete the experiment configuration files.

```zsh

# Basic usage
pairit lint your_experiment.yaml          # Validate YAML and run lints
pairit compile your_experiment.yaml      # Parse and compile to canonical JSON
pairit simulate your_experiment.yaml     # Run a local simulator of the runtime

# Publish / manage on Firestore (requires auth)
pairit publish your_experiment.yaml --owner alice@example.com  # Publish config to Firestore
pairit list --owner alice@example.com     # List configs you own
pairit get <configId> --out compiled.json # Download published canonical JSON
pairit delete <configId>                  # Delete a published config (admin/owner only)

# Advanced
pairit publish --dry-run your_experiment.yaml   # Validate and show diff without writing
pairit simulate --seed 42 your_experiment.yaml  # Deterministic simulation run using seed

## Examples
# Lint and publish
pairit lint simple-survey.yaml && pairit publish simple-survey.yaml --owner you@example.com

# Compile and inspect
pairit compile simple-survey.yaml --out simple-survey.compiled.json

```

The experiment configuration files are stored on Firestore:
- `configs/{configId}` → `{ publishedConfigId, owner, permissions, metadata, ...config, checksum }`

### Validation

#### Compilation

- YAML is compiled into canonical JSON with:
  - Normalized page shapes (missing optional fields default to empty forms).
- Buttons normalized to `{ text, action }`.
  - Survey choices required for `multiple_choice` and omitted otherwise.
  - `component` pages normalized to `{ component, props }`.

#### JSON Schema coverage

- Provide schemas for: `pages`, `user_state`, `group_state`, `queues`, `agents`, and button `action` objects.
- Pre-validate `assign` LHS paths against `user_state` schema.
 - Default `additionalProperties: false` across schemas unless explicitly opted-in to catch typos.
 - Allow `$ref` usage within schemas in-config (self-contained only; no external imports).

#### Lints

- Unique ids across `pages`, `queues`, `agents`.
- Button ids must be unique per page.
- Every `go_to` action (including each branch target) must reference an existing page.
- Types of `assign` RHS must match declared `user_state` target types.
- Forbid assignments outside `$.user_state.*` from client events.
- Unknown `action.type` values are errors.

## <a href="#frontend">Frontend</a>



## <a href="#backend">Backend</a>

- `POST /sessions/start` → `{ publicId, participantId? }` → `{ sessionId, firstNode, initialState? }`
- `GET /sessions/{sessionId}` → `{ currentPageId, user_state, user_group, endedAt? }`
- `POST /sessions/{sessionId}/advance` → `{ event: { type, payload } }` → `{ newNode, updatedState? }`
- `GET /sessions/{sessionId}/stream` → SSE stream of passive events (e.g., `match`, `timeout`, state updates)
- `POST /queues/{queueId}/enqueue` → `{ sessionId }` → `{ position, estimatedWait? }`
- `POST /chat/{groupId}/messages` → `{ text: string, role: "user" }` → 204 (response streams via SSE)
- `GET /chat/{groupId}/stream` → SSE stream of messages for the group
- `POST /agents/{agentId}/call` → server-side only invocation (streamed)

## <a href="#storage">Storage</a>


## <a href="#realtime">Realtime</a>

### Match-making

Queues are server-managed waiting rooms that collect participants until enough are available to form a group. Entering a `queue` page enqueues the current session into the named queue. The runtime matches participants FIFO into groups of `num_users`. On match it creates a `groupId`, initializes `$.user_group` (including `chat_group_id`), emits `match`, and continues. If waiting exceeds `timeoutSeconds` (or default), the runtime emits `timeout`. Optional backfill may create groups with ghost seats when enabled.

- `{ id: string, num_users: int, timeoutSeconds?: int }`
- Matching policy: FIFO by arrival time, fill groups of `num_users`. Timeout policy is configurable per queue in the config; server defaults apply when omitted.
- On match: emit `match`, write `$.user_group.chat_group_id` and `groupId`.
- On timeout: emit `timeout`.
- Default `timeoutSeconds`: 120 when unset. Authors branch on outcomes via the next page’s button action conditions.

See Data store ("Group-level shared state") for `group_state` schema and write rules. Queue outcomes drive Routing via emitted `match`/`timeout` events and initialize Chat via `chat_group_id`.

### Chat

Chat sessions are scoped to a matched group and surfaced via the built-in `chat` component.

- Scope: each group has a `chat_group_id` written to `$.user_group.chat_group_id` on match.
- Transport: RTDB channel `chats/{chat_group_id}` for message streams; server enforces ACLs by group membership.
- API: `POST /chat/{groupId}/messages` to send, `GET /chat/{groupId}/stream` for SSE.
- Agents: when a chat page lists `agents`, the server joins them to the group chat and streams their messages.
- Moderation: server-side hooks can filter/redact messages before fan-out; clients never see provider keys.

## <a href="ai">AI Agents</a>

Agents are server-hosted AI participants that can be invited into `chat` pages. Define agents once under `agents` and reference them by id in a chat page’s `agents` list. The server resolves the provider and credentials, runs the model, and streams its messages; clients never see provider keys. Basic generation controls like `temperature` and `maxTokens` are supported; advanced `tools` and `resources` are reserved for future use.

- `{ id: string, model: string, temperature?: number, maxTokens?: number }`
- Agents are resolved server-side only. Client never sees provider keys.
  - In MVP, `tools` and `resources` are reserved and ignored.

## Appendices

### Appendix A: Custom Components (optional)

Custom components allow experimenters to extend the UI without changing the runtime. The config remains routing, data, and UI wiring only.

#### Component registry

Top-level `components` entries declare contracts that the runtime validates at publish time:

- `{ id: string, version: string, propsSchema?: JSONSchema, events?: { name: string, payloadSchema?: JSONSchema }[], capabilities?: string[] }`
- `propsSchema` and `events[*].payloadSchema` are JSON Schema subsets for validation. They document what the component expects and emits.
- `capabilities` is an allowlist for built-in affordances (e.g., `clipboard`, `fileUpload`). Network or AI access is never granted via components directly.

The frontend application may maintain a `componentRegistry` mapping `id`→implementation. If an id exists in config but not in the app registry at runtime, the run MUST error with `missing_component`. The runtime records the resolved implementation version alongside the run for audit. Unless specified, `unknownEvents` defaults to `error`.

#### Using a component in a page

In a page with `component`, the runtime:
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

pages:
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
initialPageId: intro

pages:
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
pages:
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
pages:
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
