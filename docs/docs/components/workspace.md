# Workspace

Embed a collaborative, real-time workspace alongside chat or survey pages. Supports freeform (markdown) and structured (individual fields) editing, per-participant or per-group scoping, and agent read/write via tool calls.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `mode` | `"freeform"` \| `"structured"` | `"freeform"` | Editing mode: freeform markdown or structured fields |
| `editableBy` | `"participant"` \| `"agent"` \| `"both"` | `"both"` | Who can edit the workspace |
| `initialContent` | string | `""` | Initial markdown content (freeform mode) |
| `scope` | `"participant"` \| `"group"` | `"participant"` | Document scoping (see below) |
| `fields` | FieldDefinition[] | `[]` | Field definitions for structured mode |
| `agents` | string[] | `[]` | List of agent IDs that can read/write this workspace |

### FieldDefinition

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `id` | string | required | Unique field identifier |
| `label` | string | required | Display label |
| `type` | `"text"` \| `"number"` \| `"textarea"` | `"text"` | Input type |

## Scoping

Workspace documents are identified by a `groupId`. The resolution depends on `scope`:

- **`participant`** (default): Uses `{sessionId}:{pageId}` -- each participant has their own document
- **`group`**: Uses `user_state.chat_group_id` from matchmaking -- all group members share one document

## Split Layout

Use `layout: "split"` on a page to display workspace alongside other components in a two-column layout. The workspace goes in the right column, everything else in the left.

```yaml
pages:
  - id: negotiate
    layout: split
    components:
      - type: chat
        props:
          agents: [dealer]
      - type: live-workspace
        props:
          mode: freeform
          editableBy: both
          initialContent: "# Deal Terms\n\nEdit this document..."
```

Without `layout: split`, the workspace renders inline with other components.

## Events

| Event | Description |
|-------|-------------|
| `onEdit` | Emitted when the participant edits the workspace |

## Agent Integration

Agents can read and write workspace content. The current workspace content is automatically injected into the agent's system prompt.

### write_workspace Tool

Agents can update the workspace using the `write_workspace` tool:

```yaml
agents:
  - id: dealer
    model: gpt-5-mini
    system: "You are negotiating a deal. Use the workspace to draft terms."
    tools:
      - name: write_workspace
        description: "Update the workspace document with new content"
        parameters:
          type: object
          properties:
            content:
              type: string
              description: "The new markdown content for the workspace"
          required: [content]
```

## Examples

### Freeform with Agent

```yaml
pages:
  - id: collaborate
    layout: split
    components:
      - type: chat
        props:
          agents: [writer]
      - type: live-workspace
        props:
          mode: freeform
          editableBy: both
          initialContent: "# Document\n\nStart writing here..."
          agents: [writer]

agents:
  - id: writer
    model: gpt-5-mini
    system: "You are a writing assistant. Help the user draft their document."
    tools:
      - name: write_workspace
        description: "Update the workspace document"
        parameters:
          type: object
          properties:
            content:
              type: string
          required: [content]
```

### Structured Fields

```yaml
pages:
  - id: eval
    layout: split
    components:
      - type: chat
        props:
          agents: [evaluator]
      - type: live-workspace
        props:
          mode: structured
          editableBy: both
          fields:
            - id: score
              label: "Overall Score"
              type: number
            - id: reasoning
              label: "Reasoning"
              type: textarea
            - id: recommendation
              label: "Recommendation"
              type: text
```

### Group-scoped (with Matchmaking)

```yaml
pages:
  - id: matchmaking
    components:
      - type: matchmaking
        props:
          num_users: 2

  - id: collaborate
    layout: split
    components:
      - type: chat
      - type: live-workspace
        props:
          mode: freeform
          scope: group
          editableBy: both
          initialContent: "# Shared Document\n\nCollaborate here..."
```

### Agent-only Workspace

```yaml
pages:
  - id: observe
    layout: split
    components:
      - type: chat
        props:
          agents: [analyst]
      - type: live-workspace
        props:
          mode: freeform
          editableBy: agent
          agents: [analyst]
```

## Data Export

Workspace documents are exported via `pairit data export <configId>`. The export includes:

| Field | Description |
|-------|-------------|
| `groupId` | Document identifier |
| `mode` | `"freeform"` or `"structured"` |
| `content` | Final freeform content (if applicable) |
| `fields.*` | Structured field values (flattened in CSV) |
| `updatedBy` | Session ID or `agent:<agentId>` of last editor |
| `createdAt` | Document creation timestamp |
| `updatedAt` | Last update timestamp |
