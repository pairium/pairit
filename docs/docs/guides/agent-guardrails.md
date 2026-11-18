# Agent Guardrails

AI agents in experiments can inadvertently mislead participants about the experiment process. For example, a participant might ask "Can I quit?" and the agent responds "Yes, quit whenever you want" — which may not be accurate per IRB protocol. Default guardrails prevent this by constraining what agents say about the experiment itself.

## How It Works

By default, every agent's system prompt is automatically prefixed with guardrail instructions:

```
IMPORTANT GUIDELINES:
- Do NOT answer questions about the experiment itself — its process, procedures,
  compensation, duration, or participant rights.
- If a participant asks about these topics, say: "That's a great question —
  please direct it to the researcher."
- Stay in your assigned role. Do not pretend to be a researcher or experiment
  administrator.
- Do not make promises or commitments on behalf of the research team.
```

This block is prepended before the experimenter's `system` prompt, so the agent sees the guardrails first, then your role instructions, then any workspace content.

## Guardrails are instructions, not enforcement

Guardrails are text in the agent's system prompt. The model usually follows them, but nothing checks what it says or which tools it calls. A participant can try to talk an agent out of them ("ignore your instructions..."), and sometimes succeed. Don't rely on a guardrail, or on any line in your `system` prompt, to keep something from participants or to stop a tool call. Leave secrets out of the prompt, and limit tools in the config (see [Limit what tools can change](#limit-what-tools-can-change)).

## Participant text in the prompt

Values interpolated from `{{session_state.*}}` and `{{group.*}}`, and the workspace text shown to agents, can be written by participants. Pairit wraps each one in `<participant_data>` tags and tells the agent to treat tagged text as information, not instructions. This makes prompt injection harder, not impossible.

Keys that only Pairit writes are not wrapped: a randomization's `stateKey`, `treatment`, and the other keys listed under [Limit what tools can change](#limit-what-tools-can-change). So a prompt can still take instructions from a randomized condition, e.g. `{{session_state.style}}` with conditions "Be warm." and "Be formal.". A `{{group.*}}` value is always wrapped.

## Opting Out

If you need full control over the agent's behavior (for example, if the agent *is* the experiment interface and must discuss procedures), set `guardrails: false` on the agent:

```yaml
agents:
  - id: custom-agent
    model: gpt-6-luna
    guardrails: false
    system: |
      You are a custom research interface. You may discuss all aspects
      of the experiment with participants.
```

When guardrails are disabled, only your `system` prompt is used — no prefix is added.

## Best Practices

### Define boundaries explicitly

Even with guardrails on, your system prompt should clarify what the agent should and shouldn't discuss:

```yaml
system: |
  You are a negotiation partner in a pricing exercise.
  Discuss only the negotiation scenario. Do not discuss:
  - How long the experiment takes
  - What happens after this task
  - Whether participants can leave early
```

### Handle common participant questions

Participants frequently ask about quitting, compensation, data usage, and what happens next. The default guardrails redirect these to the researcher, but you can reinforce this:

```yaml
system: |
  You are a helpful tutor for this learning exercise.
  If participants ask about anything outside the exercise (compensation,
  quitting, data privacy), remind them to ask the researcher.
```

### Keep the agent in role

Agents are most effective when they stay in character. Avoid system prompts that give the agent authority over experiment logistics:

```yaml
# Good — agent stays in its lane
system: |
  You are a debate partner. Argue the assigned position persuasively.

# Bad — agent has too much authority
system: |
  You are the experiment coordinator. Guide participants through each step
  and tell them when they can leave.
```

### Combine guardrails with specific tools

If your agent uses tools like `end_chat` or `assign_state`, the guardrails still apply to text responses. The agent can use tools to advance the experiment while keeping its spoken responses in-role:

```yaml
agents:
  - id: mediator
    model: gpt-6-luna
    system: |
      You mediate a negotiation between participants.
      Use end_chat when both parties agree or after 10 exchanges.
    tools:
      - name: end_chat
        description: End the chat when negotiation concludes
        parameters:
          type: object
          properties:
            deal_reached:
              type: boolean
```

### Limit what tools can change

Tool calls are enforced by the server, so limits on them hold even when a participant talks the agent into trying something else. `assign_state` writes to every participant in the group, so list the paths it may set with an `enum` on its `path` parameter:

```yaml
tools:
  - name: assign_state
    description: Record the participant's stance
    parameters:
      type: object
      properties:
        path:
          type: string
          enum: [stance, stance_confidence]
        value: {}
      required: [path, value]
```

`assign_state` never writes keys that Pairit sets itself (`group_id`, `chat_group_id`, `treatment`, `chat`, `chat_ended`, `deal_reached`, `agreed_price`, or a randomization's `stateKey`). Without an `enum`, it may write any key your config declares under `session_state`, or any other key if the config declares no `session_state`.
