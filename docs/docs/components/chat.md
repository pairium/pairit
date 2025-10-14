# Chat

Open a chat view. With matchmaking, the server writes `$.user_group.chat_group_id` for the room. Optionally attach server-hosted AI agents by id.

Props
- agents?: string[] — list of agent ids to join the chat

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


