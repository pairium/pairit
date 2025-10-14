# Examples

## Simple Survey

```yaml
initialPageId: intro

pages:
  - id: intro
    text: |
      Welcome. Please complete this short survey.
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
    end: true

user_state:
  age: int
  gender: string
  satisfaction: int
```

## Matchmaking + Chat (+ optional agents)

```yaml
initialPageId: intro

pages:
  - id: intro
    text: |
      Welcome to the experiment!
      Press "Start" to begin.
    buttons:
      - id: start
        text: "Start"
        action: { type: go_to, target: start_survey }

  - id: start_survey
    survey:
      - id: age
        text: "How old are you?"
        answer: numeric
    buttons:
      - id: proceed
        text: "Proceed"
        action: { type: go_to, target: matchmaking }

  - id: matchmaking
    matchmaking: default_pool
    buttons:
      - id: on_match
        text: "Continue"
        action:
          type: go_to
          branches:
            - when: "$.user_state.treated == true"
              target: chat_treated
            - target: chat_control

  - id: chat_control
    chat:
    buttons:
      - id: to_outro_control
        text: "Finish"
        action: { type: go_to, target: outro }

  - id: chat_treated
    chat:
      agents: [default_agent]
    buttons:
      - id: to_outro_treated
        text: "Finish"
        action: { type: go_to, target: outro }

  - id: outro
    text: "Thank you for participating in our study."
    buttons:
      - id: return
        text: "Return to Prolific"
        action: { type: end }

user_state:
  treated: bool

matchmaking:
  - id: default_pool
    num_users: 2
    timeoutSeconds: 120

agents:
  - id: default_agent
    model: "grok-4-fast-non-reasoning"
```

## Component Events Showcase

This comprehensive example demonstrates how to configure custom events for all interactive components. Events are optional and allow you to track user interactions with detailed metadata.

```yaml
initialPageId: intro

pages:
  - id: intro
    text: "Welcome to the component events showcase."
    buttons:
      - id: start
        text: "Begin showcase"
        action:
          type: go_to
          target: button_examples
        events:
          onClick:
            type: "button_click"
            data:
              button_id: "start"
              label: "Begin showcase"
              section: "navigation"

  - id: button_examples
    text: "Button event examples."
    components:
      - type: buttons
        props:
          buttons:
            - id: primary_action
              text: "Primary Action"
              action:
                type: go_to
                target: survey_examples
              events:
                onClick:
                  type: "button_click"
                  data:
                    button_id: "primary_action"
                    category: "primary"
                    priority: "high"

  - id: survey_examples
    text: "Survey components automatically emit survey_submission events."
    survey:
      - id: user_satisfaction
        text: "How satisfied are you?"
        answer: likert5
    buttons:
      - id: survey_continue
        text: "Continue"
        action:
          type: go_to
          target: media_examples

  - id: media_examples
    text: "Media components can emit various interaction events."
    components:
      - type: media
        props:
          kind: video
          src: "https://example.com/demo.mp4"
        events:
          onPlay:
            type: "media_play"
            data:
              media_id: "demo_video"
              media_type: "video"
          onPause:
            type: "media_pause"
            data:
              media_id: "demo_video"
          onComplete:
            type: "media_complete"
            data:
              media_id: "demo_video"

  - id: matchmaking_examples
    text: "Matchmaking components emit events during the matching process."
    components:
      - type: matchmaking
        props:
          num_users: 2
          timeoutSeconds: 30
        events:
          onRequestStart:
            type: "matchmaking_start"
            data:
              pool_id: "demo_pool"
          onMatchFound:
            type: "matchmaking_success"
            data:
              pool_id: "demo_pool"
          onTimeout:
            type: "matchmaking_timeout"
            data:
              pool_id: "demo_pool"

  - id: outro
    end: true
    text: "Thank you for exploring the component events showcase!"
```

Available event hooks by component:
- **buttons**: `onClick` (default)
- **survey**: `onSubmit` (automatic)
- **media**: `onPlay`, `onPause`, `onSeek`, `onComplete`, `onError`
- **matchmaking**: `onRequestStart`, `onMatchFound`, `onTimeout`, `onCancel`
- **chat**: `onMessageSend`, `onMessageReceive`, `onTypingStart`, `onTypingStop`
- **form**: `onSubmit`, `onFieldChange`

Event data is flexible and can include any metadata relevant to your research. All events include standard fields like `sessionId`, `configId`, `pageId`, `componentType`, and `componentId`.
