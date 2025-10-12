# Chat

Open a chat view. With matchmaking, the server writes `$.user_group.chat_group_id` for the room. Optionally attach server-hosted AI agents by id.

Props
- agents?: string[] — list of agent ids to join the chat

Example

```yaml
pages:
  - id: chat_control
    chat:
    buttons:
      - id: finish
        text: "Finish"
        action: { type: go_to, target: outro }

  - id: chat_treated
    chat:
      agents: [default_agent]
```

Agents

```yaml
agents:
  - id: default_agent
    model: "grok-4-fast-non-reasoning"
```


