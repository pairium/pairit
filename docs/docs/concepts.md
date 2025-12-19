# Concepts

### DAGs

### Components

### Match-making

### Events

All component interactions in the lab runtime generate events that are stored in Firestore. This event-based architecture provides a component-agnostic way to track user interactions, collect research data, and enable analytics.

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
