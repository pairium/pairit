# Configuration

Configuration files describe how a run moves between pages, what components each page renders, and when elements appear. This guide combines the previous `Pages`, `Routing & Actions`, and `Expressions` docs into one reference.

## Top-Level Fields

Every config file supports these top-level fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `schema_version` | string | Yes | Config schema version (currently `"v2"`) |
| `initialPageId` | string | Yes | The page to start on |
| `pages` | array | Yes | Page definitions |
| `agents` | array | No | AI agent definitions (see [Agents](components/agents.md)) |
| `matchmaking` | array | No | Matchmaking pool configurations |
| `user_state` | object | No | User state schema with types and defaults |
| `allowRetake` | boolean | No | Whether completed participants can start a new session (default: `false`) |

### schema_version

Required field for config validation. Currently use `"v2"`:

```yaml
schema_version: v2
initialPageId: intro
pages:
  # ...
```

The CLI's `pairit config lint` command validates that `schema_version` is present.

### allowRetake

Controls whether participants who have completed the experiment can start a new session:

```yaml
schema_version: v2
allowRetake: true  # Allow participants to retake
initialPageId: intro
pages:
  # ...
```

When `allowRetake: false` (default):
- Completed participants see a "You have already completed this experiment" message
- Session resumption still works for in-progress sessions

When `allowRetake: true`:
- Completed participants can start a fresh session
- Useful for testing or experiments that allow multiple completions

## Pages

Pages declare which components appear and which buttons can advance the run. Built-in components cover common UI; custom components mount via a registry entry.

Common page fields:

- `id`: string, unique within the config
- `end?`: boolean; when true, entering the page ends the session
- `endRedirectUrl?`: string; optional URL exposed as a "Continue" button on end pages. Participants can follow it to finish in an external system instead of restarting.
- `components?`: array of component instances shown on the page (canonical)
- `layout?`: optional presentation hints for the client

Top-level helpers (normalized at compile time):

- `text`: string → normalized to a text component instance
- `buttons`: array of `{ text, action }` → normalized to a buttons component instance
- Single-component shorthand: define `componentType`/`props`/`buttons` at the page root; the compiler normalizes to one component instance plus trailing buttons

Canonical component instance shapes:

- Built-in text: `{ type: "text", props: { text: string, markdown?: bool } }`
- Built-in buttons: `{ type: "buttons", props: { buttons: [ { text: string, action: Action } ] } }`
- Built-in survey: `{ type: "survey", props: { questions: [{ id, text, answer, choices? }] } }`
- Built-in matchmaking: `{ type: "matchmaking", props: { poolId: string } }`
- Built-in chat: `{ type: "chat", props: { agents?: string[] } }`
- Custom component host: `{ type: "component", props: { component: string, props: object, unknownEvents?: "error" | "warn" | "ignore" } }`

Example page using helpers:

```yaml
pages:
  - id: intro
    text: |
      Welcome to the study!
    buttons:
      - id: next
        text: "Next"
        action: { type: go_to, target: outro }

  - id: outro
    end: true
    endRedirectUrl: "https://app.prolific.com/submissions/complete?cc=ABCD1234"
```

## Routing & Actions

Routing advances the participant between pages using button actions. Use conditional branches to route based on state or the triggering event.

Core actions:

- `go_to`: move to a target page id
- `next`: advance to the next page when using linear flows
- `end`: mark the session ended

Conditional routing with branches:

```yaml
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
    text: "We're sorry to hear that. Can you tell us what woke you up?"
    buttons:
      - id: continue
        text: "Continue"
        action: { type: go_to, target: outro }

  - id: outro
    end: true
```

## Expressions

Use expressions to conditionally render components and route between pages. Expressions evaluate with a safe `expr-eval` subset.

Context roots available:

- `$event`
- `$.user_state`
- `$.user_group`
- `$.env`
- `$.now`
- `$.run`

Whitelisted functions:

- `min`, `max`, `abs`, `floor`, `ceil`, `round`
- `and`, `or`, `not`
- `coalesce`, `len`, `includes`, `lower`, `upper`, `trim`
- `rand`

Example component-level conditional rendering:

```yaml
pages:
  - id: sleep_q
    components:
      - type: text
        props: { text: "How many hours did you sleep last night?" }
      - type: survey
        props:
          questions:
            - id: sleep_hours
              text: "Hours slept"
              answer: numeric
      - type: text
        when: "$.user_state.sleep_hours < 5"
        props: { text: "We're sorry to hear that. Can you tell us what woke you up?" }
```

## Data store

Declare a `user_state` schema to describe the participant-scoped fields your run uses. The compiler validates assignments against this schema and wires default values into the initial session state.

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

Guidelines:
- Primitive aliases (`int`, `bool`, `string`) map to JSON Schema types; expand to objects when you need nested data.
- Use `default` to seed initial values.
- Set `additionalProperties: false` on objects unless you expect dynamic keys.

At runtime access the store through the `UserStoreContext` helpers:

```ts
const { state, assign, bulkAssign } = useUserStore();

await assign('sleep_hours', 6);
await bulkAssign({
  consent: true,
  survey_answers: { q1: 'text response' },
});
```

Assignments outside `$.user_state.*` are rejected during validation. Surveys automatically write answers into the store using their question ids, so follow-up expressions can branch on the captured values.


