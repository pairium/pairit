# Chat

Open a chat view for real-time messaging. Supports human-human chat (via matchmaking) and human-AI chat (via agents). See the [AI Chat](../examples.md#ai-chat) and [Multi-Chat](../examples.md#multi-chat) examples.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `agents` | string[] | `[]` | List of agent ids to join the chat (see [Agents](agents.md)) |
| `groupId` | string | - | Explicit chat group identifier for shared contexts |
| `placeholder` | string | `"Type a message..."` | Placeholder text in the message input |
| `avatars` | object | - | Avatar overrides for `self`, `participant`, `agent`, or specific `agents.{id}`. See [Avatars](#avatars). |

## Group Resolution

Chat rooms are identified by `groupId`. The resolution order is:

1. **Matchmaking**: If participant was matched, uses `session_state.chat_group_id` (shared with matched participants)
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
      - type: chat  # Uses session_state.chat_group_id from matchmaking
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

## Side by side

On a `layout: split` page, set `column` to put the chat in the left or right column. The chat then fills its column instead of keeping its standalone height. See [Split layout](../configuration.md#split-layout).

```yaml
pages:
  - id: negotiate
    layout: split
    components:
      - type: chat
        column: right
        props:
          agents: [dealer]
      - type: html
        column: left
        props:
          src: listing.html
```

## Avatars

An avatar is a string. A value with `/` or `:` is an image path or URL. Anything else is a [Lucide](https://lucide.dev/icons) icon name in kebab-case, like `bot`, `sparkles`, or `graduation-cap`.

Chat accepts these overrides:

- `self`: your own messages, in your own view only
- `participant`: other participants
- `agent`: all agents
- `agents.{agentId}`: one agent

```yaml
pages:
  - id: ai_chat
    components:
      - type: chat
        props:
          agents: [assistant, tutor]
          avatars:
            self: user-round
            participant: leaf
            agent: bot
            agents:
              tutor: /images/tutor.png

agents:
  - id: assistant
    model: gpt-6-luna
    avatar: sparkles
    system: You are a helpful assistant.
```

### Avatars from session state

`participant` can use `{{session_state.<key>}}`. The value comes from the **sender's** state when they send a message, and is saved with the message. Everyone in the chat sees the same avatar for that participant, and it is included in the data export.

To give each member of a group a different avatar, assign it with a distributed randomization:

```yaml
pages:
  - id: chat
    onEnter:
      - type: randomize
        scope: group
        distribute: true
        conditions: [leaf, sun]
        stateKey: avatar
    components:
      - type: chat
        props:
          avatars:
            participant: "{{session_state.avatar}}"
```

Any source of `session_state` works. A survey question with id `avatar` lets participants choose their own. For images, build the path: `participant: "/avatars/{{session_state.role}}.png"`.

An avatar is fixed when the message is sent. If the key is unset or the icon name doesn't exist, the default is used.

### Precedence

Own messages: `self`, then your saved avatar, then the default user icon.

Other participants: the avatar saved on the message, then `participant`, then a nature icon chosen from the sender's ID.

Agents: `agents.{agentId}`, then the agent's own `avatar`, then `agent`, then the bot icon.

The older `{ icon: ..., image: ... }` form still works. If both are set, `image` wins.

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

## Session state

Chat now maintains a server-side per-session counter at `session_state.chat.messages_sent` for participant-authored messages. You can use it in conditional UI and text interpolation:

```yaml
session_state:
  chat:
    type: object
    properties:
      messages_sent:
        type: integer
        default: 0

pages:
  - id: discussion
    components:
      - type: chat
      - type: text
        when: "session_state.chat.messages_sent >= 3"
        props:
          text: "Thanks — you've sent {{session_state.chat.messages_sent}} messages."
```

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


