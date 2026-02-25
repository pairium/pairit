# Examples

Ready-to-use experiment templates. Click "Try it" to run the live demo.

## Hello World

The simplest experiment: one question, one button.

[Try it →](https://lab-432501290611.us-central1.run.app/hello-world)

<details>
<summary>View config</summary>

```yaml
schema_version: 0.1.0
initialPageId: survey

pages:
  - id: survey
    components:
      - type: survey
        props:
          items:
            - id: mood
              text: "How are you feeling today?"
              answer: likert5
      - type: buttons
        props:
          buttons:
            - id: done
              text: "Submit"
              action:
                type: go_to
                target: thanks

  - id: thanks
    end: true
    components:
      - type: text
        props:
          text: "Thanks for your response!"
```

</details>

---

## Survey

Multi-page survey with different question types.

[Try it →](https://lab-432501290611.us-central1.run.app/survey-only)

<details>
<summary>View config</summary>

```yaml
schema_version: 0.1.0
initialPageId: consent

pages:
  - id: consent
    components:
      - type: text
        props:
          text: |
            # Informed Consent

            You are being invited to participate in a research study.
            Your participation is voluntary.
      - type: buttons
        props:
          buttons:
            - id: accept
              text: "I consent"
              action:
                type: go_to
                target: demographics
            - id: decline
              text: "I do not consent"
              action:
                type: go_to
                target: declined

  - id: declined
    end: true
    components:
      - type: text
        props:
          text: "Thank you for your time."

  - id: demographics
    components:
      - type: survey
        props:
          items:
            - id: age
              text: "What is your age?"
              answer: numeric
            - id: gender
              text: "What is your gender?"
              answer:
                multiple_choice:
                  choices:
                    - Male
                    - Female
                    - Non-binary
                    - Prefer not to say
      - type: buttons
        props:
          buttons:
            - id: demo_next
              text: "Next"
              action:
                type: go_to
                branches:
                  - when: "user_state.age < 18"
                    target: ineligible
                  - target: main_survey

  - id: ineligible
    end: true
    components:
      - type: text
        props:
          text: "Sorry, you must be 18 or older to participate."

  - id: main_survey
    components:
      - type: survey
        props:
          items:
            - id: satisfaction
              text: "How satisfied are you with your current work-life balance?"
              answer: likert7
            - id: sleep_hours
              text: "How many hours did you sleep last night?"
              answer: numeric
            - id: comments
              text: "Any additional comments?"
              answer: text
      - type: buttons
        props:
          buttons:
            - id: submit
              text: "Submit"
              action:
                type: go_to
                target: debrief

  - id: debrief
    end: true
    components:
      - type: text
        props:
          text: |
            # Thank you!

            Your responses have been recorded.
```

</details>

---

## Randomization

Randomly assign participants to conditions using `onEnter` hooks — no extra page needed.

[Try it →](https://lab-432501290611.us-central1.run.app/randomization-demo)

<details>
<summary>View config</summary>

```yaml
schema_version: 0.1.0
initialPageId: intro

pages:
  - id: intro
    components:
      - type: text
        props:
          text: |
            # Randomization Demo

            This demo assigns you to an experimental condition
            invisibly when you continue.
      - type: buttons
        props:
          buttons:
            - id: start
              text: "Start"
              action:
                type: go_to
                target: result

  - id: result
    onEnter:
      - type: randomize
        assignmentType: random
        conditions:
          - A
          - B
        stateKey: condition
    components:
      - type: text
        props:
          text: "You were assigned to condition: **{{user_state.condition}}**"
      - type: buttons
        props:
          buttons:
            - id: finish
              text: "Finish"
              action:
                type: go_to
                target: end

  - id: end
    end: true
    components: []
```

</details>

---

## AI Chat

One-on-one conversation with an AI agent.

[Try it →](https://lab-432501290611.us-central1.run.app/ai-chat)

<details>
<summary>View config</summary>

```yaml
schema_version: 0.1.0
initialPageId: intro

pages:
  - id: intro
    components:
      - type: text
        props:
          text: |
            # Negotiation Study

            You will negotiate the price of a used car with an AI assistant.
            Try to get the best deal you can.
      - type: buttons
        props:
          buttons:
            - id: start
              text: "Start negotiation"
              action:
                type: go_to
                target: chat

  - id: chat
    components:
      - type: chat
        props:
          agents:
            - dealer
      - type: buttons
        props:
          buttons:
            - id: end_chat
              text: "End negotiation"
              action:
                type: go_to
                target: thanks

  - id: thanks
    end: true
    components:
      - type: text
        props:
          text: "Thank you for participating!"

agents:
  - id: dealer
    model: "gpt-5-mini"
    system: |
      You are a used car dealer selling a 2019 Honda Civic with 45,000 miles.
      Reserve price: $12,000 (won't sell below). Starting ask: $18,000.
      Be friendly but firm. Keep responses SHORT - 1-2 sentences max.
```

</details>

---

## Multi-Chat

Share or isolate chat history across pages using `groupId`.

[Try it →](https://lab-432501290611.us-central1.run.app/multi-chat)

<details>
<summary>View config</summary>

```yaml
schema_version: 0.1.0
initialPageId: intro

pages:
  - id: intro
    components:
      - type: text
        props:
          text: |
            # Multi-Chat Demo

            This experiment demonstrates chat groupId scoping:
            - **Shared chats**: Multiple pages share the same conversation
            - **Isolated chats**: Each page has separate message history (default)
      - type: buttons
        props:
          buttons:
            - id: start
              text: "Start Demo"
              action:
                type: go_to
                target: chat_1

  # Shared chat pages: same groupId means messages persist across them
  - id: chat_1
    components:
      - type: text
        props:
          text: |
            ## Round 1: Financial Advisor

            This chat uses `groupId: "consultation"`. Messages will carry over to Round 2.
      - type: chat
        props:
          groupId: "consultation"
          agents:
            - advisor
          placeholder: "Ask about investment strategies..."
      - type: buttons
        props:
          buttons:
            - id: next
              text: "Continue to Round 2"
              action:
                type: go_to
                target: chat_2

  - id: chat_2
    components:
      - type: text
        props:
          text: |
            ## Round 2: Same Advisor (Shared Memory)

            Same `groupId: "consultation"` - the advisor remembers Round 1 conversation.
      - type: chat
        props:
          groupId: "consultation"
          agents:
            - advisor
          placeholder: "Continue the conversation..."
      - type: buttons
        props:
          buttons:
            - id: next
              text: "Try Isolated Chat"
              action:
                type: go_to
                target: chat_isolated

  # No groupId = isolated by default (uses session:pageId)
  - id: chat_isolated
    components:
      - type: text
        props:
          text: |
            ## Isolated Chat

            No `groupId` prop - this chat is isolated to this page only.
            Messages here won't appear on other pages.
      - type: chat
        props:
          agents:
            - advisor
          placeholder: "Start a fresh conversation..."
      - type: buttons
        props:
          buttons:
            - id: finish
              text: "Finish Demo"
              action:
                type: go_to
                target: outro

  - id: outro
    end: true
    components:
      - type: text
        props:
          text: |
            # Demo Complete

            You've seen how `groupId` controls chat memory:
            - **Explicit groupId**: Share messages across pages
            - **No groupId**: Isolated per-page history (default)

agents:
  - id: advisor
    model: "gpt-5-mini"
    system: |
      You are a friendly financial advisor. Give brief, helpful responses.
      If the user has spoken to you before in this session, acknowledge the prior conversation.
      Keep responses SHORT - 2-3 sentences max.
```

</details>

---

## Team Decision

Match 2 participants and let them chat together.

[Try it →](https://lab-432501290611.us-central1.run.app/team-decision) (open in 2 tabs)

<details>
<summary>View config</summary>

```yaml
schema_version: 0.1.0
initialPageId: consent

pages:
  - id: consent
    components:
      - type: text
        props:
          text: |
            # Team Decision Study

            You will be paired with another participant to make a decision together.
      - type: buttons
        props:
          buttons:
            - id: agree
              text: "I agree to participate"
              action:
                type: go_to
                target: matching

  - id: matching
    components:
      - type: matchmaking
        props:
          poolId: main_pool
      - type: buttons
        props:
          buttons:
            - id: matched
              text: "Continue to chat"
              action:
                type: go_to
                target: chat

  - id: matching_timeout
    end: true
    components:
      - type: text
        props:
          text: "We couldn't find enough group members at this time. Thank you for trying!"

  - id: chat
    components:
      - type: text
        props:
          text: "**Your task:** Decide together which candidate to hire from the three profiles below."
      - type: chat
      - type: buttons
        props:
          buttons:
            - id: done
              text: "We've decided"
              action:
                type: go_to
                target: thanks

  - id: thanks
    end: true
    components:
      - type: text
        props:
          text: "Thank you for participating!"

matchmaking:
  - id: main_pool
    num_users: 2
    timeoutSeconds: 180
    timeoutTarget: matching_timeout
```

</details>

---

## AI Mediation

Two participants chat with an AI facilitator observing and guiding.

[Try it →](https://lab-432501290611.us-central1.run.app/ai-mediation) (open in 2 tabs)

<details>
<summary>View config</summary>

```yaml
schema_version: 0.1.0
initialPageId: consent

pages:
  - id: consent
    components:
      - type: text
        props:
          text: |
            # AI-Mediated Discussion Study

            You will be paired with another participant for a discussion.
            An AI facilitator will help guide your conversation.
      - type: buttons
        props:
          buttons:
            - id: agree
              text: "I agree to participate"
              action:
                type: go_to
                target: matching

  - id: matching
    components:
      - type: matchmaking
        props:
          poolId: mediation_pool
      - type: buttons
        props:
          buttons:
            - id: matched
              text: "Start discussion"
              action:
                type: go_to
                target: chat

  - id: matching_timeout
    end: true
    components:
      - type: text
        props:
          text: "We couldn't find a partner at this time. Thank you for trying!"

  - id: chat
    components:
      - type: text
        props:
          text: "**Your task:** Discuss with your partner which candidate to recommend for hire."
      - type: chat
        props:
          agents:
            - facilitator
      - type: buttons
        props:
          buttons:
            - id: done
              text: "We've reached a conclusion"
              action:
                type: go_to
                target: thanks

  - id: thanks
    end: true
    components:
      - type: text
        props:
          text: "Thank you for participating!"

matchmaking:
  - id: mediation_pool
    num_users: 2
    timeoutSeconds: 120
    timeoutTarget: matching_timeout

agents:
  - id: facilitator
    model: "gpt-5-nano"
    system: |
      You are a neutral facilitator helping two people make a hiring decision.
      Keep responses to ONE short sentence. Be extremely brief.
      Ask a question OR make an observation, never both.
      Stay neutral - never express preferences.
```

</details>

---

## Workspace

AI-assisted document editing with a split-panel layout.

<details>
<summary>View config</summary>

```yaml
schema_version: 0.1.0
initialPageId: intro

pages:
  - id: intro
    components:
      - type: text
        props:
          text: |
            # Workspace Demo

            You'll collaborate with an AI assistant to draft a document.
            The chat is on the left, the shared workspace is on the right.
      - type: buttons
        props:
          buttons:
            - id: start
              text: "Start"
              action:
                type: go_to
                target: workspace

  - id: workspace
    layout: split
    components:
      - type: chat
        props:
          agents:
            - writer
          placeholder: "Ask the AI for help..."
      - type: live-workspace
        props:
          mode: freeform
          editableBy: both
          initialContent: |
            # Project Proposal

            ## Objective


            ## Approach


            ## Timeline

          agents:
            - writer
      - type: buttons
        props:
          buttons:
            - id: done
              text: "Finish"
              action:
                type: go_to
                target: thanks

  - id: thanks
    end: true
    components:
      - type: text
        props:
          text: "Thank you for participating!"

agents:
  - id: writer
    model: "gpt-5-mini"
    system: |
      You are a writing assistant helping the user draft a project proposal.
      The shared workspace contains the current document.
      Use the write_workspace tool to update the document when the user asks for edits.
      Keep chat responses SHORT - 1-2 sentences. Do the real work in the workspace.
    tools:
      - name: write_workspace
        description: "Update the workspace document with new content"
        parameters:
          type: object
          properties:
            content:
              type: string
              description: "The full updated markdown content for the workspace"
          required: [content]
```

</details>

---

## Timer

Countdown timer with warning state and auto-navigation on expiry.

[Try it →](https://lab-432501290611.us-central1.run.app/timer-demo)

<details>
<summary>View config</summary>

```yaml
pages:
  - id: intro
    components:
      - type: text
        props:
          text: |
            # Timed Reading Demo

            On the next page you will have **25 seconds** to read a passage.
            A warning will appear when 15 seconds remain.
          markdown: true
      - type: buttons
        props:
          buttons:
            - id: start
              text: Start Reading
              action:
                type: go_to
                target: timed_reading

  - id: timed_reading
    components:
      - type: text
        props:
          text: |
            ## The Marshmallow Experiment

            In the late 1960s, psychologist Walter Mischel conducted a series of experiments
            at Stanford University's Bing Nursery School. Children were offered a choice
            between one small reward (a marshmallow, pretzel, or cookie) provided immediately,
            or two small rewards if they waited for approximately 15 minutes.

            The researchers found that children who were able to wait longer for the preferred
            rewards tended to have better life outcomes, as measured by SAT scores, educational
            attainment, body mass index, and other measures. However, subsequent research has
            questioned the strength and generalizability of these findings, suggesting that
            socioeconomic factors and the child's home environment play significant roles in
            both the ability to delay gratification and later life outcomes.
          markdown: true
      - type: timer
        id: reading_timer
        props:
          duration: 25
          warning: 15
          action:
            type: go_to
            target: times_up
        events:
          onStart:
            type: timer_started
            data:
              phase: reading
          onWarning:
            type: timer_warning
            data:
              phase: reading
          onExpiry:
            type: timer_expired
            data:
              phase: reading

  - id: times_up
    components:
      - type: text
        props:
          text: |
            # Time's Up!

            Your reading time has ended. Thank you for participating.
          markdown: true
      - type: buttons
        props:
          buttons:
            - id: finish
              text: Finish
              action:
                type: go_to
                target: end

  - id: end
    end: true
    components:
      - type: text
        props:
          text: |
            # Thank You

            The demo is complete.
          markdown: true
```

</details>

---

## Component Events

Track custom analytics events on user interactions.

<details>
<summary>View config</summary>

```yaml
schema_version: 0.1.0
initialPageId: intro

pages:
  - id: intro
    components:
      - type: text
        props:
          text: "Welcome to the component events showcase."
      - type: buttons
        props:
          buttons:
            - id: start
              text: "Begin"
              action:
                type: go_to
                target: survey
              events:
                onClick:
                  type: "button_click"
                  data:
                    button_id: "start"
                    section: "navigation"

  - id: survey
    components:
      - type: survey
        props:
          items:
            - id: satisfaction
              text: "How satisfied are you?"
              answer: likert5
      - type: buttons
        props:
          buttons:
            - id: submit
              text: "Submit"
              action:
                type: go_to
                target: thanks

  - id: thanks
    end: true
    components:
      - type: text
        props:
          text: "Thank you!"
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
| timer | `onStart`, `onWarning`, `onExpiry` |
| live-workspace | `onEdit` |
