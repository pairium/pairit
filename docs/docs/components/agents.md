# Agents

AI agents participate in chat conversations as server-hosted participants. Agents are defined at the config level and attached to chat components via the `agents` prop.

## Configuration

Define agents in your experiment config's `agents` array:

```yaml
agents:
  - id: assistant
    model: gpt-4o
    avatar:
      icon: bot
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

## Avatars

Agents can define an optional `avatar` used in chat UIs.

```yaml
agents:
  - id: tutor
    model: gpt-4o
    avatar:
      icon: graduation-cap
    system: You are a tutor.

  - id: chef
    model: gpt-4o
    avatar:
      image: /images/chef.png
    system: You are a chef.
```

Notes:
- `avatar.icon` uses a Lucide icon name. Kebab-case like `graduation-cap` is recommended.
- `avatar.image` can be a relative public path like `/images/chef.png` or another image URL.
- If both are provided, `image` wins.
- If no avatar is set, agents use the default bot icon.

## Models

Agents support both OpenAI and Anthropic models. The provider is inferred from the model name:

**OpenAI models** (requires a per-config OpenAI key uploaded with `pairit config upload --openai-api-key ...`):
- `gpt-4o`, `gpt-4o-mini`
- `o1`, `o1-mini`, `o3-mini`
- Any OpenAI-compatible model

**Anthropic models** (requires a per-config Anthropic key uploaded with `pairit config upload --anthropic-api-key ...`):
- `claude-sonnet-4-5-20250929`
- `claude-haiku-4-5-20251001`
- Any model starting with `claude`

Provider keys are stored per experiment, encrypted at rest, and resolved by `configId` at runtime. Agent execution does not fall back to a shared platform API key. If the required provider key is missing, the agent run fails.

## Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `id` | string | required | Unique identifier for the agent |
| `model` | string | required | Model name (e.g., `gpt-4o`, `claude-sonnet-4-5-20250929`) |
| `system` | string | required | System prompt defining the agent's role and behavior |
| `avatar` | object | - | Optional chat avatar for this agent. Supports `icon` (Lucide icon name) or `image` (URL/path). |
| `trigger` | string \| object \| array | `every_message` | When to potentially run the agent. See [Triggers](#triggers). |
| `replyCondition` | string \| object \| array | `always` | Whether the agent actually responds once triggered. See [Reply Conditions](#reply-conditions). |
| `sendFirstMessage` | boolean | `false` | **Legacy.** Sends an opening message when chat loads and room is empty. Ignored if `trigger` is set. |
| `guardrails` | boolean | `true` | Prepend default guardrail instructions to the system prompt. Set to `false` to opt out. See [Agent Guardrails](../guides/agent-guardrails.md). |
| `reasoningEffort` | string | - | For reasoning models: `minimal`, `low`, `medium`, `high` |
| `prompts` | array | - | Conditional prompt blocks based on `session_state`. See [Conditional Prompts](#conditional-prompts). |
| `tools` | array | - | Tool definitions the agent can invoke |

## Triggers

The `trigger` field controls **when** the agent potentially runs. Triggers can be a single value or an array of values.

| Trigger | Description |
|---------|-------------|
| `every_message` | Run on every participant message (default) |
| `on_join` | Run when the chat page loads, even if there's existing history |
| `{ every: N }` | Run every N participant messages since the agent's last reply |

```yaml
agents:
  # Greets on every page join
  - id: greeter
    trigger: on_join
    # ...

  # Checks in every 3 participant messages
  - id: coach
    trigger:
      every: 3
    # ...

  # Greets on join AND replies to messages
  - id: assistant
    trigger: [on_join, every_message]
    # ...
```

**Backwards compatibility:** `sendFirstMessage: true` still works exactly as before — it only fires when the room has zero messages. If an agent has an explicit `trigger` field, `sendFirstMessage` is ignored.

## Reply Conditions

The `replyCondition` field controls **whether** the agent actually responds once triggered. Conditions can be a single value or an array (all must pass).

| Condition | Description |
|-----------|-------------|
| `always` | Always reply (default) |
| `"prompt string"` | LLM evaluates whether to reply based on the prompt |
| `{ type: "llm", prompt: "..." }` | Explicit form of the above |

When a string or LLM condition is used, the agent makes a quick yes/no LLM call before responding. If the answer is "no", the agent stays silent.

```yaml
agents:
  # Only replies when the participant seems stuck or asks a question
  - id: facilitator
    trigger: every_message
    replyCondition: "Reply only if the participant asked a direct question or seems stuck."
    # ...

  # Explicit object form
  - id: reviewer
    trigger: every_message
    replyCondition:
      type: llm
      prompt: "Reply only if the participant submitted new work to review."
    # ...
```

## Conditional Prompts

Agent system prompts can adapt based on `session_state` using two mechanisms: **template interpolation** and **conditional prompt blocks**.

### Template Interpolation

Use `{{session_state.key}}` anywhere in a system prompt to inject the participant's state value:

```yaml
agents:
  - id: tutor
    model: gpt-4o
    system: |
      You are a tutor helping a student who scored {{session_state.pretest_score}} on the pretest.
      Their learning style is {{session_state.learning_style}}.
      Adapt your explanations accordingly.
```

If a referenced key is missing from `session_state`, the placeholder is left as-is (e.g., `{{session_state.missing_key}}`).

### Conditional Blocks

Use the `prompts` array to select entirely different system prompts based on `session_state`. Each entry has an optional `when` condition and a `system` prompt. The first matching `when` wins; an entry without `when` serves as the default fallback.

```yaml
agents:
  - id: negotiator
    model: gpt-4o
    system: You are a negotiation partner.  # base fallback
    prompts:
      - when: "session_state.condition == 'cooperative'"
        system: |
          You are a friendly negotiation partner. Be warm, make concessions,
          and aim for a win-win outcome.
      - when: "session_state.condition == 'competitive'"
        system: |
          You are a tough negotiation partner. Hold firm on price,
          use anchoring tactics, and push for the best deal.
      - system: |
          You are a neutral negotiation partner.
```

Conditions support comparison operators: `==`, `!=`, `<`, `>`, `<=`, `>=`. The left side must be `session_state.<key>` and the right side can be a string, number, or boolean.

Both mechanisms can be combined — `{{session_state.x}}` interpolation is applied after the conditional block is selected:

```yaml
prompts:
  - when: "session_state.arm == 'treatment'"
    system: |
      You are helping participant {{session_state.participant_id}}.
      Use the advanced teaching strategy.
  - system: |
      You are helping participant {{session_state.participant_id}}.
      Use the standard approach.
```

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
          description: The session_state path to update
        value:
          description: The value to assign
      required: [path, value]
```

### Built-in Tool Behaviors

**`end_chat`**: Ends the chat for all participants in the group. Sets `session_state.chat_ended = true` and broadcasts a `chat_ended` event. Optional `deal_reached` and `agreed_price` parameters are written to user state.

**`assign_state`**: Writes a value to `session_state.{path}` for all participants and broadcasts a `state_updated` event.

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

1. **Chat loads**: Agents with `trigger: on_join` (or legacy `sendFirstMessage: true`) run
2. **Participant sends message**: Agents are checked against their `trigger` (e.g., `every_message`, `{ every: 3 }`)
3. **Condition check**: If the agent has a `replyCondition`, it's evaluated before generating a response
4. **Streaming**: Agent responses stream in real-time via SSE deltas
5. **Tool calls**: Agents can invoke tools which execute server-side and broadcast state changes
6. **Timeout**: Agent runs timeout after 60 seconds to prevent runaway responses

## Events

Agent activity generates events:

- `chat_message` with `senderType: "agent"` for agent messages
- `agent_tool_call` when an agent invokes a tool

These events are stored in the `events` collection for analysis.
