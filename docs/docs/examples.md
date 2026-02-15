# Examples

Ready-to-use experiment templates. Click "Try it" to run the live demo.

## Hello World

The simplest experiment: one question, one button.

[Try it →](https://lab-432501290611.us-central1.run.app/hello-world)

<details>
<summary>View config</summary>

```yaml
schema_version: v2
initialPageId: survey

pages:
  - id: survey
    survey:
      - id: mood
        text: "How are you feeling today?"
        answer: likert5
    buttons:
      - id: done
        text: "Submit"
        action: { type: go_to, target: thanks }

  - id: thanks
    text: "Thanks for your response!"
    end: true
```

</details>

---

## Survey

Multi-page survey with different question types.

[Try it →](https://lab-432501290611.us-central1.run.app/survey-showcase)

<details>
<summary>View config</summary>

```yaml
schema_version: v2
initialPageId: intro

pages:
  - id: intro
    text: "Welcome. Please complete this short survey."
    buttons:
      - id: begin
        text: "Begin"
        action: { type: go_to, target: survey_1 }

  - id: survey_1
    survey:
      - id: age
        text: "What is your age?"
        answer: numeric
      - id: gender
        text: "What is your gender?"
        answer: multiple_choice
        choices: [Male, Female, Other, Prefer not to say]
      - id: satisfaction
        text: "How satisfied are you with our service?"
        answer: likert5
    buttons:
      - id: finish
        text: "Finish"
        action: { type: go_to, target: outro }

  - id: outro
    text: "Thank you for participating!"
    end: true
```

</details>

---

## Randomization

Randomly assign participants to conditions.

[Try it →](https://lab-432501290611.us-central1.run.app/randomization-demo)

<details>
<summary>View config</summary>

```yaml
schema_version: v2
initialPageId: randomize

pages:
  - id: randomize
    randomize:
      stateKey: condition
      conditions: [control, treatment_a, treatment_b]
      assignmentType: balanced_random
    buttons:
      - id: continue
        text: "Continue"
        action:
          type: go_to
          branches:
            - when: "$.user_state.condition == 'control'"
              target: control_page
            - when: "$.user_state.condition == 'treatment_a'"
              target: treatment_a_page
            - target: treatment_b_page

  - id: control_page
    text: "You are in the **control** group."
    end: true

  - id: treatment_a_page
    text: "You are in **treatment A**."
    end: true

  - id: treatment_b_page
    text: "You are in **treatment B**."
    end: true
```

</details>

---

## AI Chat

One-on-one conversation with an AI agent.

[Try it →](https://lab-432501290611.us-central1.run.app/ai-chat)

<details>
<summary>View config</summary>

```yaml
schema_version: v2
initialPageId: intro

pages:
  - id: intro
    text: "Chat with our AI assistant about any topic."
    buttons:
      - id: start
        text: "Start Chat"
        action: { type: go_to, target: chat }

  - id: chat
    chat:
      agents: [assistant]
      placeholder: "Type your message..."
    buttons:
      - id: finish
        text: "End Chat"
        action: { type: go_to, target: thanks }

  - id: thanks
    text: "Thanks for chatting!"
    end: true

agents:
  - id: assistant
    model: gpt-4o
    systemPrompt: "You are a helpful assistant. Be concise and friendly."
```

</details>

---

## Team Decision

Match 2 participants and let them chat together.

[Try it →](https://lab-432501290611.us-central1.run.app/team-decision) (open in 2 tabs)

<details>
<summary>View config</summary>

```yaml
schema_version: v2
initialPageId: intro

pages:
  - id: intro
    text: "You'll be matched with another participant to discuss a decision."
    buttons:
      - id: start
        text: "Find Partner"
        action: { type: go_to, target: waiting }

  - id: waiting
    matchmaking: team_pool
    onMatchTarget: discussion
    timeoutTarget: solo

  - id: discussion
    text: "Discuss with your partner: **Should we invest in renewable energy?**"
    chat:
      groupId: "$.groupId"
    buttons:
      - id: done
        text: "Submit Decision"
        action: { type: go_to, target: thanks }

  - id: solo
    text: "No partner found. Thanks for trying!"
    end: true

  - id: thanks
    text: "Thanks for participating!"
    end: true

matchmaking:
  - id: team_pool
    num_users: 2
    timeoutSeconds: 60
```

</details>

---

## AI Mediation

Two participants chat with an AI facilitator observing and guiding.

[Try it →](https://lab-432501290611.us-central1.run.app/ai-mediation) (open in 2 tabs)

<details>
<summary>View config</summary>

```yaml
schema_version: v2
initialPageId: intro

pages:
  - id: intro
    text: "You'll discuss a topic with another participant. An AI mediator will help guide the conversation."
    buttons:
      - id: start
        text: "Join Discussion"
        action: { type: go_to, target: waiting }

  - id: waiting
    matchmaking: mediation_pool
    onMatchTarget: mediated_chat
    timeoutTarget: timeout

  - id: mediated_chat
    text: "**Topic:** Should social media be regulated?"
    chat:
      groupId: "$.groupId"
      agents: [mediator]
    buttons:
      - id: finish
        text: "End Discussion"
        action: { type: go_to, target: thanks }

  - id: timeout
    text: "No partner found."
    end: true

  - id: thanks
    text: "Thanks for participating!"
    end: true

matchmaking:
  - id: mediation_pool
    num_users: 2
    timeoutSeconds: 90

agents:
  - id: mediator
    model: gpt-4o
    systemPrompt: |
      You are a neutral discussion facilitator. Your role:
      - Encourage both participants to share their views
      - Ask clarifying questions
      - Summarize points of agreement and disagreement
      - Keep the conversation respectful and productive
      Only speak when helpful. Don't dominate the conversation.
```

</details>

---

## Component Events

Track custom analytics events on user interactions.

<details>
<summary>View config</summary>

```yaml
schema_version: v2
initialPageId: intro

pages:
  - id: intro
    text: "Welcome to the component events showcase."
    buttons:
      - id: start
        text: "Begin"
        action: { type: go_to, target: survey }
        events:
          onClick:
            type: "button_click"
            data:
              button_id: "start"
              section: "navigation"

  - id: survey
    survey:
      - id: satisfaction
        text: "How satisfied are you?"
        answer: likert5
    buttons:
      - id: submit
        text: "Submit"
        action: { type: go_to, target: thanks }

  - id: thanks
    text: "Thank you!"
    end: true
```

</details>

**Available event hooks:**

| Component | Events |
|-----------|--------|
| buttons | `onClick` |
| survey | `onSubmit` (automatic) |
| media | `onPlay`, `onPause`, `onSeek`, `onComplete`, `onError` |
| matchmaking | `onRequestStart`, `onMatchFound`, `onTimeout`, `onCancel` |
| chat | `onMessageSend`, `onMessageReceive` |
