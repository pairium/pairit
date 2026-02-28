# Randomization

Assign participants to experimental conditions.

## Recommended: `onEnter` hooks

The recommended approach is to add randomization as an `onEnter` action on the target page. This runs invisibly during navigation — no extra page, no flash.

### Basic usage

```yaml
pages:
  - id: intro
    components:
      - type: buttons
        props:
          buttons:
            - text: Continue
              action: { type: go_to, target: chat }
  - id: chat
    onEnter:
      - type: randomize
        conditions: [control, treatment]
    components:
      - type: chat
        props: { ... }
```

When the participant navigates to `chat`, the randomization runs in the background before the page renders.

### `onEnter` action properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `type` | string | - | Must be `"randomize"` |
| `conditions` | string[] | `[]` | Condition names to assign from |
| `assignmentType` | string | `"random"` | Algorithm: `random`, `balanced_random`, or `block` |
| `stateKey` | string | `"treatment"` | User state key where the assignment is stored |
| `scope` | string | `"session"` | `"session"` for per-participant, `"group"` for group-level |

### Group-level randomization

When `scope: group`, all members of a matchmaking group receive the same treatment. Requires that matchmaking has already set `session_state.group_id`.

```yaml
pages:
  - id: matching
    components:
      - type: matchmaking
        props:
          poolId: main_pool
      - type: buttons
        props:
          buttons:
            - text: Continue
              action: { type: go_to, target: task }
  - id: task
    onEnter:
      - type: randomize
        conditions: [control, treatment]
        scope: group
    components:
      - type: chat
        props: { ... }
```

The first group member to enter the page triggers randomization. Subsequent members receive the same condition (idempotent).

### Multiple randomizations

You can run multiple randomizations on the same page by using different `stateKey` values:

```yaml
onEnter:
  - type: randomize
    conditions: [control, treatment]
    stateKey: treatment
  - type: randomize
    conditions: [prompt_A, prompt_B]
    stateKey: prompt_variant
```

## Assignment types

### `random`

Pure random selection from the conditions array. Each condition has equal probability regardless of previous assignments.

### `balanced_random`

Attempts to balance group sizes over time. Favors underrepresented conditions while maintaining randomness.

### `block`

Block randomization for strict balance within defined block sizes. Ensures equal distribution within each block.

## Component mode

You can also use randomization as a rendered component. This is useful when you want to show the assignment result or need a dedicated randomization page.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `assignmentType` | string | `"random"` | Assignment algorithm: `random`, `balanced_random`, or `block` |
| `conditions` | string[] | `[]` | Array of condition names to assign from |
| `stateKey` | string | `"treatment"` | User state key where the assignment is stored |
| `target` | string | - | Page to auto-navigate to after assignment |
| `showAssignment` | boolean | `true` | Whether to display the assignment result briefly |

### Example

```yaml
pages:
  - id: randomize
    components:
      - type: randomization
        props:
          conditions: [control, treatment_A, treatment_B]
          stateKey: treatment
          target: intro
```

## State

After randomization, the assigned condition is stored at `session_state.{stateKey}`:

```yaml
# If stateKey is "treatment" and assigned "A":
# session_state.treatment = "A"
```

Access this value in expressions:

```yaml
- when: "session_state.treatment == 'A'"
  target: treatment_a_page
```

## Server-side

Randomization calls the `/sessions/:id/randomize` endpoint which:

1. Checks if a previous assignment exists for this session + stateKey
2. If existing, returns the same condition (idempotent)
3. If new, applies the assignment algorithm and persists the result

For `scope: group`, the endpoint:

1. Reads `session_state.group_id` from the session
2. Checks if any group member already has `session_state.{stateKey}` set
3. If found, returns the existing condition and ensures the requesting session also has it
4. If not, assigns a new condition and sets it on all group members

This ensures participants always see the same condition even if they refresh or return later.

## Events

Randomization does not emit custom events by default. The assignment is recorded in user state and can be correlated with other events via the session.
