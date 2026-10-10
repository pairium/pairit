# Quickstart

Get your first experiment running in minutes using the Pairit CLI.

## Install the CLI

```bash
npm install -g pairit
# or
bun install -g pairit
```

## Request access

Manager access is currently invite-only. Email [harang@pairium.ai](mailto:harang@pairium.ai) with the Google account email you want to use, and you'll be added to the allowlist. You only need to do this once.

## Authenticate

```bash
pairit login
```

This opens a browser window for Google OAuth when available. On a remote or headless server, the CLI prints a login URL instead; open it on your local machine, sign in, and paste the one-time authorization code back into the CLI.

If you see an "Access denied" page after signing in, your account isn't on the allowlist yet — email [harang@pairium.ai](mailto:harang@pairium.ai) to request access.

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

If a page uses an `html` component, keep the `.html` file next to the YAML (`src: slider.html`). Lint lists the file; upload attaches it. See [HTML](components/html.md).

**3. Upload to the server:**

```bash
pairit config upload my-experiment.yaml
```

The file name becomes the config's name (`my-experiment`), or set `name:` in the YAML or pass `--name`. The first upload prints the participant link, e.g. `https://pairit.pairium.ai/my-experiment-k3f9x2m8q1`. Uploading again under the same name keeps that link and adds a new revision.

If your experiment uses AI agents, include the provider key for that experiment when uploading:

```bash
pairit config upload my-experiment.yaml \
  --openai-api-key sk-...
```

or:

```bash
pairit config upload my-experiment.yaml \
  --anthropic-api-key sk-ant-...
```

These keys are stored encrypted per experiment. Pairit does not use a shared platform provider key for experiment agent runs; if the required provider key is missing, the agent run fails.

Re-uploading the same config without a new key keeps the previously stored key for that experiment.

**4. Share the experiment link** that the upload printed with participants.

## Export Data

```bash
pairit data export <configId> --format csv --out ./results
```

## Next Steps

- [Configuration](configuration.md) - Pages, routing, expressions
- [Components](components.md) - Survey, chat, matchmaking, agents
- [CLI](cli.md) - All commands and options
- [Examples](examples.md) - Full experiment templates
