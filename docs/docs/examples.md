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
