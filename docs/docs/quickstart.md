# Quickstart

Get your first experiment running in minutes using the Pairit CLI.

## Install the CLI

```bash
npm install -g @pairit/cli
# or
bun install -g @pairit/cli
```

## Authenticate

```bash
pairit login
```

This opens a browser window for Google OAuth. Once authenticated, you can manage experiments.

## Create Your First Experiment

**1. Create `my-experiment.yaml`:**

```yaml
schema_version: v2
initialPageId: intro

pages:
  - id: intro
    text: "Welcome to the study!"
    buttons:
      - id: start
        text: "Start"
        action: { type: go_to, target: survey }

  - id: survey
    survey:
      - id: age
        text: "What is your age?"
        answer: numeric
    buttons:
      - id: submit
        text: "Submit"
        action: { type: go_to, target: thanks }

  - id: thanks
    text: "Thank you for participating!"
    end: true
```

**2. Validate your config:**

```bash
pairit config lint my-experiment.yaml
```

**3. Upload to the server:**

```bash
pairit config upload my-experiment.yaml --config-id my-experiment
```

**4. Share the experiment link** with participants: `https://lab.pairium.ai/my-experiment`

## Export Data

```bash
pairit data export my-experiment --format csv --output results.csv
```

## Next Steps

- [Configuration](configuration.md) - Pages, routing, expressions
- [Components](components.md) - Survey, chat, matchmaking, agents
- [CLI](cli.md) - All commands and options
- [Examples](examples.md) - Full experiment templates
