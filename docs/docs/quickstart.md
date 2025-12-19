# Quickstart

Get a minimal study running using the canonical pages/components model.

1) Create a YAML config

```yaml
initialPageId: intro

pages:
  - id: intro
    text: |
      Welcome. Please complete this short survey.
    buttons:
      - id: intro-start
        text: "Begin"
        action:
          type: go_to
          target: survey_1

  - id: survey_1
    text: "Pretend survey question"
    buttons:
      - id: survey-submit
        text: "Submit"
        action:
          type: go_to
          branches:
            - when: "$event.payload.choice == 'follow_up'"
              target: survey_follow_up
            - target: outro

  - id: survey_follow_up
    text: "Thanks for opting in to the follow-up."
    buttons:
      - id: follow_up_continue
        text: "Continue"
        action:
          type: go_to
          target: outro

  - id: outro
    end: true

user_state:
  choice: string
```

2) Validate, simulate, or publish with the CLI

```zsh
pairit config lint your_experiment.yaml
pairit config compile your_experiment.yaml
pairit config upload your_experiment.yaml --owner you@example.com
```

3) Share the experiment link with participants

Next: read Configuration → Pages, Routing & Actions, and Expressions.


