# Agents

AI agents participate in chat conversations as server-hosted participants. Agents are defined at the config level and attached to chat components via the `agents` prop.

## Configuration

Define agents in your experiment config's `agents` array:

```yaml
agents:
  - id: assistant
    model: gpt-4o
    system: |
      You are a helpful research assistant participating in a group discussion.
      Be concise and stay on topic.
    sendFirstMessage: true

  - id: mediator
    model: claude-sonnet-4-5-20250929
    system: |
      You are a neutral mediator facilitating discussion between participants.
      Help resolve disagreements constructively.
    tools:
      - name: end_chat
        description: End the chat when discussion reaches a conclusion
        parameters:
          type: object
          properties:
            deal_reached:
              type: boolean
            agreed_price:
              type: number
```

## Models

Agents support both OpenAI and Anthropic models. The provider is inferred from the model name:

**OpenAI models** (requires `OPENAI_API_KEY`):
- `gpt-4o`, `gpt-4o-mini`
- `o1`, `o1-mini`, `o3-mini`
- Any OpenAI-compatible model

**Anthropic models** (requires `ANTHROPIC_API_KEY`):
- `claude-sonnet-4-5-20250929`
- `claude-haiku-4-5-20251001`
- Any model starting with `claude`

## Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `id` | string | required | Unique identifier for the agent |
| `model` | string | required | Model name (e.g., `gpt-4o`, `claude-sonnet-4-5-20250929`) |
| `system` | string | required | System prompt defining the agent's role and behavior |
| `sendFirstMessage` | boolean | `false` | If true, agent sends an opening message when chat loads |
| `reasoningEffort` | string | - | For reasoning models: `minimal`, `low`, `medium`, `high` |
| `tools` | array | - | Tool definitions the agent can invoke |

## Context

Agents receive the full chat history as context. Messages are formatted as:
- Participant messages → `user` role
- Agent messages → `assistant` role

The system prompt is prepended to establish the agent's persona and instructions.

## Tools

Agents can perform actions beyond text responses using tools. Define tools with a name, description, and JSON Schema parameters:

```yaml
tools:
  - name: end_chat
    description: End the chat session and record the outcome
    parameters:
      type: object
      properties:
        deal_reached:
          type: boolean
          description: Whether participants reached an agreement
        agreed_price:
          type: number
          description: The agreed price if a deal was reached
      required: [deal_reached]

  - name: assign_state
    description: Update participant state during the conversation
    parameters:
      type: object
      properties:
        path:
          type: string
          description: The user_state path to update
        value:
          description: The value to assign
      required: [path, value]
```

### Built-in Tool Behaviors

**`end_chat`**: Ends the chat for all participants in the group. Sets `$.user_state.chat_ended = true` and broadcasts a `chat_ended` event. Optional `deal_reached` and `agreed_price` parameters are written to user state.

**`assign_state`**: Writes a value to `$.user_state.{path}` for all participants and broadcasts a `state_updated` event.

## Usage with Chat

Attach agents to a chat component using the `agents` prop:

```yaml
pages:
  - id: discussion
    components:
      - type: chat
        props:
          agents: [assistant, mediator]  # references agent ids
```

## Lifecycle

1. **Chat loads**: If any agent has `sendFirstMessage: true`, it generates and sends an opening message
2. **Participant sends message**: All attached agents receive the updated history and can respond
3. **Streaming**: Agent responses stream in real-time via SSE deltas
4. **Tool calls**: Agents can invoke tools which execute server-side and broadcast state changes
5. **Timeout**: Agent runs timeout after 60 seconds to prevent runaway responses

## Events

Agent activity generates events:

- `chat_message` with `senderType: "agent"` for agent messages
- `agent_tool_call` when an agent invokes a tool

These events are stored in the `events` collection for analysis.
