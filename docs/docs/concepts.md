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

#### Event Data Field

The `data` field is flexible and component-specific:

- **Survey submissions**: Contains the survey answers as key-value pairs where keys are question IDs and values are the user's responses
- **Button clicks**: Could contain button ID, label, and action details
- **Media interactions**: Could contain play/pause events, timestamps, etc.

#### Storage

Events are stored in a top-level Firestore collection called `events`, with auto-generated document IDs. This allows efficient querying by session, config, page, or component type.

#### Extensibility

The event system is designed to be extensible. New component types can emit events by following the same structure, making it easy to add tracking for new interaction types without changing the core architecture.
