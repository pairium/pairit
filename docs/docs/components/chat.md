# Chat

Open a chat view for real-time messaging. Supports human-human chat (via matchmaking) and human-AI chat (via agents).

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `agents` | string[] | `[]` | List of agent ids to join the chat (see [Agents](agents.md)) |
| `groupId` | string | - | Explicit chat group identifier for shared contexts |
| `placeholder` | string | `"Type a message..."` | Placeholder text in the message input |

## Group Resolution

Chat rooms are identified by `groupId`. The resolution order is:

1. **Matchmaking**: If participant was matched, uses `$.user_state.chat_group_id` (shared with matched participants)
2. **Explicit prop**: If `groupId` prop is set, uses `{sessionId}:{groupId}` (session-scoped)
3. **Default**: Uses `{sessionId}:{pageId}` (isolated to this session and page)

### Shared Chat (via Matchmaking)

When participants are matched, they share a `chat_group_id` and see each other's messages:

```yaml
pages:
  - id: matchmaking
    components:
      - type: matchmaking
        props:
          num_users: 2

  - id: discussion
    components:
      - type: chat  # Uses $.user_state.chat_group_id from matchmaking
```

### Isolated Chat (AI Only)

Without matchmaking, each participant has their own chat context:

```yaml
pages:
  - id: ai_chat
    components:
      - type: chat
        props:
          agents: [assistant]
          placeholder: "Ask me anything..."
```

### Explicit Group Sharing

Use `groupId` to share context across pages within a session:

```yaml
pages:
  - id: chat_1
    components:
      - type: chat
        props:
          groupId: main_conversation

  - id: chat_2
    components:
      - type: chat
        props:
          groupId: main_conversation  # Same conversation continues
```

Events
- `onMessageSend`: emitted when user sends a message
- `onMessageReceive`: emitted when user receives a message
- `onTypingStart`: emitted when user begins typing
- `onTypingStop`: emitted when user stops typing

Event Data
- `chat_group_id`: identifier of the chat room/group
- `message_id`: unique identifier for the message (send/receive events)
- `sender_type`: "participant", "agent", or "system" (receive events)
- `message_length`: character count of the message (send events)
- `agent_id`: which agent sent the message (agent messages only)
- Custom data can be added via `events.{eventName}.data`

Example

```yaml
pages:
  - id: chat_control
    components:
      - type: chat
        id: group_chat_control
        events:
          onMessageSend:
            type: "chat_message_sent"
            data:
              condition: "control"
          onMessageReceive:
            type: "chat_message_received"
            data:
              condition: "control"
    buttons:
      - id: finish
        text: "Finish"
        action: { type: go_to, target: outro }

  - id: chat_treated
    components:
      - type: chat
        id: group_chat_treated
        props:
          agents: [default_agent]
        events:
          onMessageSend:
            type: "chat_message_sent"
            data:
              condition: "treated"
              has_agent: true
          onMessageReceive:
            type: "chat_message_received"
            data:
              condition: "treated"
              has_agent: true
    buttons:
      - id: finish
        text: "Finish"
        action: { type: go_to, target: outro }
```

Agents

```yaml
agents:
  - id: default_agent
    model: "grok-4-fast-non-reasoning"
```


