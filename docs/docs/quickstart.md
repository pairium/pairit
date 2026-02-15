# Quickstart

Get your first experiment running in minutes.

## Prerequisites

- [Bun](https://bun.sh) v1.1+
- MongoDB Atlas account or local MongoDB
- Google Cloud project (for OAuth)

## Setup

```bash
git clone https://github.com/pairium/pairit.git
cd pairit
bun install
cp .env.example .env  # Fill in MONGODB_URI, GOOGLE_CLIENT_ID, etc.
bun run dev
```

This starts the lab app at http://localhost:3000 and API at http://localhost:3001.

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
    components:
      - type: survey
        props:
          questions:
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

**2. Validate and upload:**

```bash
pairit config lint my-experiment.yaml
pairit config upload my-experiment.yaml
```

**3. Open the survey link** (e.g., `http://localhost:3000/abc123`)

## Next Steps

- [Configuration](configuration.md) - Pages, routing, expressions
- [Components](components.md) - Survey, chat, matchmaking, etc.
- [CLI](cli.md) - All commands including data export


