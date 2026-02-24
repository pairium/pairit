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

## Opting Out

If you need full control over the agent's behavior (for example, if the agent *is* the experiment interface and must discuss procedures), set `guardrails: false` on the agent:

```yaml
agents:
  - id: custom-agent
    model: gpt-4o
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
    model: gpt-4o
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
