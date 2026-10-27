# Workspace

Embed a shared, real-time workspace alongside chat or survey pages. Supports freeform (markdown) and structured (individual fields) editing, per-participant or per-group scoping, and agent read/write via tool calls. See the [Workspace example](../examples.md#workspace).

Participants and agents edit the same document at the same time. Their edits merge, so nobody's work is lost, and every change is saved with its author. Participants edit markdown in a code-style editor; the markdown is not rendered yet.

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
- **`group`**: Uses `session_state.chat_group_id` from matchmaking -- all group members share one document per page

## Split Layout

Use `layout: "split"` on a page to display workspace alongside other components in a two-column layout. By default the workspace goes in the right column and everything else in the left. Set `column: left` or `column: right` on any component to move it (see [Split layout](../configuration.md#split-layout)).

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

An agent listed in the workspace's `agents` prop edits it the way coding agents edit files. It sees the workspace as one file, `workspace.md` (or `fields.json` for structured mode), and gets the file-editing tools its model was trained on. You don't declare any tools.

| Model | Tools |
|-------|-------|
| Claude | Claude's text editor (`str_replace_based_edit_tool`): view, replace, insert |
| GPT-5.1 and later | `apply_patch`, plus `read_workspace` |
| Other models | `read_workspace`, `edit_workspace` (replace exact text), `write_workspace` (whole file) |

- The agent views the file before editing, and each tool's result goes back to it, so it can fix a refused edit and continue. It can make up to 8 model calls per reply.
- An edit must match the current text exactly once, so it never overwrites text a participant changed. A whole-file write is refused if the file changed since the agent last viewed it.
- With `editableBy: participant`, agents can view the file but not edit it.
- In structured mode, an edit that leaves `fields.json` invalid, names an unknown field, or puts text in a number field is refused.
- Agent edits are recorded as `agent:<agentId>`, and each tool call is logged as a `workspace_tool` event.

Other agents on the page, not listed in `agents`, get a copy of the current content in their system prompt and can't edit it.

```yaml
agents:
  - id: writer
    model: gpt-6-luna
    system: "You are a writing assistant. Edit the shared document when the user asks."
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
    model: gpt-6-luna
    system: "You are a writing assistant. Help the user draft their document."
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

`pairit data export <configId>` writes two workspace files.

`<configId>-workspace-documents` has one row per workspace:

| Field | Description |
|-------|-------------|
| `groupId` | Document identifier. A group workspace's is `<chat_group_id>/<pageId>`. |
| `mode` | `"freeform"` or `"structured"` |
| `content` | Final freeform content (if applicable) |
| `authorship` | Freeform: the final text in order, split by who wrote each part, as `[{ origin, text }]` (JSON in CSV) |
| `fields.*` | Structured field values (flattened in CSV) |
| `fieldAuthors.*` | Structured: who last set each field |
| `updateCount` | Number of changes in the update log |
| `updatedBy` | Session ID or `agent:<agentId>` of last editor |
| `createdAt` | Document creation timestamp |
| `updatedAt` | Last update timestamp |

`<configId>-workspace-updates` has every change, in order:

| Field | Description |
|-------|-------------|
| `groupId` | Document identifier, as above |
| `origin` | Who made the change: `session:<sessionId>`, `agent:<agentId>`, `seed` (the `initialContent`) or `migration` |
| `createdAt` | When the server saved it |
| `update` | The change as a base64 [Yjs](https://docs.yjs.dev/) update. Applying a document's updates in order with `Y.applyUpdate` rebuilds it at any moment. |
