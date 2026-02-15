# Concepts

This page covers core concepts that power Pairit experiments: flow logic, user state, randomization, matchmaking, and events.

## Flow Logic

Experiments are structured as pages connected by actions. Participants navigate through pages based on button actions and conditional routing.

### Page Transitions

Buttons define how participants move between pages. Each button has an `action` that determines the target page:

```yaml
buttons:
  - id: next
    text: "Continue"
    action: { type: go_to, target: survey_page }
```

### Conditional Navigation

Use `branches` to route participants dynamically based on their state or responses:

```yaml
buttons:
  - id: submit
    text: "Submit"
    action:
      type: go_to
      branches:
        - when: "$.user_state.age < 18"
          target: ineligible_page
        - when: "$.user_state.consent == true"
          target: main_study
        - target: declined_page  # default fallback
```

Branches are evaluated in order; the first matching condition determines the target. A branch without `when` serves as the default fallback.

### Action Types

- `go_to`: Navigate to a specific page by id
- `next`: Advance to the next page in linear flows
- `end`: Mark the session as ended

## User State

The `user_state` object stores participant data throughout a session. Components automatically write to user state, and expressions can read from it.

### State Schema

Define expected fields in your config's `user_state` section:

```yaml
user_state:
  age: int
  consent: bool
  treatment:
    type: string
    default: "control"
  survey_responses:
    type: object
    additionalProperties: true
```

### stateKey Pattern

Components that assign values use `stateKey` to specify where data is stored:

```yaml
components:
  - type: randomization
    props:
      stateKey: treatment        # writes to $.user_state.treatment
      conditions: [control, A, B]
```

Common `stateKey` patterns:
- `treatment` - treatment group assignment
- `group_id` - matchmaking group identifier
- `chat_group_id` - chat room identifier

### State Persistence

User state is persisted to MongoDB with each update. If a participant closes and reopens their session, their state is restored automatically.

### Accessing State in Expressions

Use `$.user_state.{fieldName}` in `when` conditions and branch expressions:

```yaml
- when: "$.user_state.treatment == 'A'"
  target: treatment_a_page
```

## Randomization

Assign participants to experimental conditions using the `randomization` component:

```yaml
- type: randomization
  props:
    assignmentType: balanced_random  # or: random, block
    conditions: [control, treatment_A, treatment_B]
    stateKey: treatment
```

The assigned condition is stored at `$.user_state.{stateKey}` and persists across page refreshes.

See [Randomization](components/randomization.md) for full documentation.

## Match-making

### Events

All component interactions in the lab runtime generate events that are stored in MongoDB (the `events` collection). This event-based architecture provides a component-agnostic way to track user interactions, collect research data, and enable analytics.

#### Event Structure

Events have a standardized structure with the following fields:

- `type` (string): The type of event (e.g., `"survey_submission"`, `"button_click"`)
- `timestamp` (string): ISO 8601 timestamp when the event occurred
- `sessionId` (string): The session ID where the event occurred
- `configId` (string): The experiment configuration ID
- `pageId` (string): The page ID where the event occurred
- `componentType` (string): The type of component that generated the event (e.g., `"survey"`, `"button"`)
- `componentId` (string): The ID of the specific component instance
- `data` (object): Component-specific event data (flexible structure)

#### Event Configuration

Components can be configured with custom event metadata in the YAML config:

```yaml
components:
  - type: button
    id: my_button
    props:
      text: "Click me"
    events:
      onClick:
        type: "custom_button_click"
        data:
          experiment_phase: "testing"
          button_category: "primary"
```

#### Event Hooks by Component

- **Buttons**: `onClick` - emitted when button is clicked
- **Survey**: `onSubmit` - emitted automatically when survey is submitted
- **Media**: `onPlay`, `onPause`, `onSeek`, `onComplete`, `onError` - various media interactions
- **Matchmaking**: `onRequestStart`, `onMatchFound`, `onTimeout`, `onCancel` - matchmaking lifecycle
- **Chat**: `onMessageSend`, `onMessageReceive`, `onTypingStart`, `onTypingStop` - chat interactions
- **Form**: `onSubmit`, `onFieldChange` - form submissions and field updates

#### Event Data Field

The `data` field is flexible and component-specific:

- **Survey submissions**: Contains all survey answers as key-value pairs
- **Button clicks**: Contains `button_id`, `label`, and custom metadata
- **Media interactions**: Contains `media_id`, `current_time`, `duration`, etc.
- **Matchmaking events**: Contains `pool_id`, `group_size`, `wait_duration_seconds`
- **Chat events**: Contains `chat_group_id`, `message_id`, `sender_type`
- **Form events**: Contains `form_id`, `field_values`, `field_id` (on change)

#### Storage

Events are stored in a top-level MongoDB collection called `events`, with auto-generated document IDs. This allows efficient querying by session, config, page, or component type.

#### Extensibility

The event system is designed to be extensible. New component types can emit events by following the same structure, making it easy to add tracking for new interaction types without changing the core architecture.
