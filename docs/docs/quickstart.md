# Quickstart

Get your first experiment running in minutes using the Pairit CLI.

## Install the CLI

```bash
npm install -g pairit
# or
bun install -g pairit
```

## Authenticate

```bash
pairit login
```

This opens a browser window for Google OAuth when available. On a remote or headless server, the CLI prints a login URL instead; open it on your local machine, sign in, and paste the one-time authorization code back into the CLI.

## Create Your First Experiment

**1. Create `my-experiment.yaml`:**

```yaml
schema_version: 0.1.0
initialPageId: intro

pages:
  - id: intro
    components:
      - type: text
        props:
          text: "Welcome to the study!"
      - type: buttons
        props:
          buttons:
            - id: start
              text: "Start"
              action: { type: go_to, target: survey }

  - id: survey
    components:
      - type: survey
        props:
          items:
            - id: age
              text: "What is your age?"
              answer: numeric
      - type: buttons
        props:
          buttons:
            - id: submit
              text: "Submit"
              action: { type: go_to, target: thanks }

  - id: thanks
    end: true
    components:
      - type: text
        props:
          text: "Thank you for participating!"
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
