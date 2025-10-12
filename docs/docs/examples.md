# Examples

### Simple survey

A minimal survey you can upload as `your_experiment.yaml` to run a short questionnaire.

```yaml
nodes:
  - id: intro
    text: |
      Welcome. Please complete this short survey.
    buttons:
      - text: "Begin"
        action: next
  - id: survey_1
    survey:
      - id: age
        text: "What is your age?"
        answer: numeric
      - id: gender
        text: "What is your gender?"
        answer: multiple_choice
        choices:
          - Male
          - Female
          - Other
          - Prefer not to say
      - id: satisfaction
        text: "How satisfied are you with our service?"
        answer: likert5
  - id: outro
    text: "Thank you for completing the survey."
    buttons:
      - text: "Finish"
        action: end

flow:
  - from: intro
    to: survey_1
  - from: survey_1
    to: outro

user_state:
  age: int
  gender: string
  satisfaction: int
```

## Chat, Randomization, AI Agents

Here is a more sophisticated example that randomly matches humans to chat with other humans or AI.

```yaml
nodes:
  - id: intro
    text: |
      Welcome to the experiment!
      Press "Start" to begin.
    buttons:
      - text: "Start"
        action: next
  - id: start_survey
    survey:
      - id: question1
        text: "How old are you?"
        answer: numeric
      - id: question2
        text: "You like apples."
        answer: likert7
  - id: queue
    queue: default_queue
  - id: chat_control
    chat:
  - id: chat_treated
    chat:
      agents:
        - default_agent
  - id: outro
    text: "Thank you for participating in our study."
    button:
      - text: "Return to Prolific"
        action: "return_to_prolific(ENTER_COMPLETION_CODE)"

flow:
  - from: intro
    to: start_survey
  - from: start_survey
    on:
      complete:
        - assign:
          "$.user_state.treated": "rand() < 0.5"
    to: queue
  - from: queue
    when: "$.user_state.treated == true"
    on:
      match:
        - assign:
          "$.user_group.chat_group_id": "match_id"
    to: chat_treated
  - from: queue
    when: "$.user_state.treated == false"
    on:
      match:
        - assign:
          "$.user_group.chat_group_id": "match_id"
    to: chat_control
  - from: chat_control
    to: outro
  - from: chat_treated
    to: outro

user_state:
  treated: bool
  chat_group_id: int
  chat_messages:
    type: array
    items:
      type: object
      properties:
        from: {type: string}
        text: {type: string}
        type: {type: string, const: "chat_message"}

queues:
  - id: default_queue
    num_users: 2

agents:
  - id: default_agent
    model: "grok-4-fast-non-reasoning"
```
