# Randomization

Assign participants to experimental conditions. This is a side-effect component that executes randomization logic without displaying UI (unless `showAssignment` is enabled).

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `assignmentType` | string | `"random"` | Assignment algorithm: `random`, `balanced_random`, or `block` |
| `conditions` | string[] | `[]` | Array of condition names to assign from |
| `stateKey` | string | `"treatment"` | User state key where the assignment is stored |
| `target` | string | - | Page to auto-navigate to after assignment |
| `showAssignment` | boolean | `true` | Whether to display the assignment result briefly |

## Assignment Types

### `random`

Pure random selection from the conditions array. Each condition has equal probability regardless of previous assignments.

```yaml
components:
  - type: randomization
    props:
      assignmentType: random
      conditions: [control, treatment]
```

### `balanced_random`

Attempts to balance group sizes over time. Favors underrepresented conditions while maintaining randomness.

```yaml
components:
  - type: randomization
    props:
      assignmentType: balanced_random
      conditions: [A, B, C]
```

### `block`

Block randomization for strict balance within defined block sizes. Ensures equal distribution within each block.

```yaml
components:
  - type: randomization
    props:
      assignmentType: block
      conditions: [control, treatment]
```

## Usage

### Basic Randomization

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

### Silent Randomization

Hide the assignment display and auto-advance immediately:

```yaml
components:
  - type: randomization
    props:
      conditions: [A, B]
      stateKey: group
      showAssignment: false
      target: next_page
```

### With Conditional Routing

Randomize first, then route based on assignment:

```yaml
pages:
  - id: randomize
    components:
      - type: randomization
        props:
          conditions: [control, treatment]
          stateKey: treatment
    buttons:
      - id: continue
        text: "Continue"
        action:
          type: go_to
          branches:
            - when: "$.user_state.treatment == 'treatment'"
              target: treatment_flow
            - target: control_flow
```

## State

After randomization, the assigned condition is stored at `$.user_state.{stateKey}`:

```yaml
# If stateKey is "treatment" and assigned "A":
# $.user_state.treatment = "A"
```

Access this value in expressions:

```yaml
- when: "$.user_state.treatment == 'A'"
  target: treatment_a_page
```

## Server-Side

Randomization calls the `/sessions/:id/randomize` endpoint which:

1. Checks if a previous assignment exists for this session + stateKey
2. If existing, returns the same condition (idempotent)
3. If new, applies the assignment algorithm and persists the result

This ensures participants always see the same condition even if they refresh or return later.

## Events

Randomization does not emit custom events by default. The assignment is recorded in user state and can be correlated with other events via the session.
