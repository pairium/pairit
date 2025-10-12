---
title: Overview
---

Pairit is a platform for running human-AI experiments.

As an experimenter, you can create a single-file YAML config that configures your entire experiment and deploy it to run on Prolific. You can create a simple survey or complex randomizations with live chat and AI agents.

If you don't find a UI component that you need, you can create custom components that meet your needs.

### Key Features

1. flexible, easy experiment design
2. many human-AI configurations (human-AI, human-human, N humans M AI, etc)
3. real-time chat
4. AI agents
5. collaborative, real-time workspace

### Quickstart

Configure an experiment in minutes. Here is a quick survey study:

```yaml

nodes:
  - id: intro
    text: |
      Welcome to a short survey. Press "Begin" to continue.
    buttons:
      - text: "Begin"
        action: next
  - id: survey_1
    survey:
      - id: age
        text: "How old are you?"
        answer: numeric
      - id: satisfaction
        text: "How satisfied are you with our service?"
        answer: likert5
  - id: outro
    text: "Thanks for participating."
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
  satisfaction: int
```

Then, upload `your_experiment.yaml` to the [experiment registry]().
