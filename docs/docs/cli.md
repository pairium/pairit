# CLI

Validate, simulate, and publish experiment configs.

Basic usage

```zsh
pairit config lint your_experiment.yaml # Validate YAML and run lints
pairit config compile your_experiment.yaml # Parse and compile to canonical JSON
```

Publish / manage configs (stored in MongoDB via the Manager Server API)

```zsh
pairit config upload your_experiment.yaml
pairit config upload your_experiment.yaml --name my-exp --openai-api-key-env OPENAI_API_KEY
pairit config upload your_experiment.yaml --name my-exp --anthropic-api-key-env ANTHROPIC_API_KEY
pairit config list
pairit config history <configId>
pairit config history <configId> --revision 1 --out rev1.json
pairit config get <configId> --out compiled.json # TODO
pairit config delete <configId>
```

### Names, links, and revisions

Each config has a **name** you choose and a **config ID** that Pairit assigns. The ID is the participant link.

- The name comes from `--name`, else a top-level `name:` in the YAML, else the file name without `.yaml`.
- Names are unique among your own configs only. Two researchers can both have `trust-study`.
- The first upload of a name creates the config and prints its link, e.g. `https://pairit.pairium.ai/trust-study-k3f9x2m8q1`. The random part keeps links unguessable.
- Uploading again under the same name keeps the ID and link. If the compiled config changed, it becomes a new **revision** (1, 2, 3…). Changing only settings like `allowRetake` keeps the revision.
- Every session records the revision it ran, and the sessions export includes it as `configRevision`.
- A participant who returns mid-session keeps the revision they started on.
- If participants already ran the previous revision, upload warns you. For a real new study, rather than a fix, upload under a new name to get a new link and separate data.
- `pairit config history <configId>` lists revisions with their session counts. `--revision N` prints or saves that revision's compiled config.
- `--config-id` updates a config by ID. Use it for configs created before names existed. Creating a new config with `--config-id` is admin-only.

### Per-experiment LLM credentials

If a config includes AI agents, upload the required provider key with that config.

- The OpenAI key is used for OpenAI models like `gpt-6-luna`, the Anthropic key for Anthropic models like `claude-sonnet-*`
- Pass each key one of three ways:

    | OpenAI | Anthropic | Reads the key from |
    |---|---|---|
    | `--openai-api-key-env VAR` | `--anthropic-api-key-env VAR` | the environment variable `VAR` |
    | `--openai-api-key-stdin` | `--anthropic-api-key-stdin` | stdin (one key per upload) |
    | `--openai-api-key sk-...` | `--anthropic-api-key sk-ant-...` | the command line |

    Prefer the first two: a key on the command line shows up in `ps` and your shell history. For example:

    ```zsh
    export OPENAI_API_KEY=sk-...   # or keep it in a .env your shell loads
    pairit config upload exp.yaml --openai-api-key-env OPENAI_API_KEY
    pbpaste | pairit config upload exp.yaml --openai-api-key-stdin
    ```

- `--clear-openai-api-key` and `--clear-anthropic-api-key` remove a stored key
- Keys are encrypted at rest and stored per `configId`
- Re-uploading the same config without a new key keeps the existing key for that config. Setting one provider's key keeps the other's.
- Agent runs do not fall back to a shared platform API key
- If the required provider key is missing, the agent run fails

Coming soon

```zsh
pairit simulate --seed 42 your_experiment.yaml
```

## Compilation output

- Normalizes helper shorthands (`text`, `buttons`, `componentType`) into canonical component entries.
- Expands survey questions so each answer has a declared type (and required choices for `multiple_choice`).

Compiled JSON can be written with `--out <file>` to inspect what the runtime will consume.

## Validation & lints

`pairit config lint` runs structural checks before you publish:
- Validate props against JSON Schemas declared in components.
- Enforce unique ids across `pages`, `matchmaking`, and `agents`.
- Require unique button ids per page and ensure every `go_to`/branch target exists.
- Verify `assign` statements only touch `session_state.*` and that RHS types match the schema.
- Reject unknown `action.type` values and undeclared component events.

## HTML embeds

Reference a local `.html` file from an `html` component (`src: slider.html`). No extra command.

```zsh
pairit config lint experiment.yaml
# ✓ experiment.yaml passed lint checks
#   html slider_task ← slider.html (4.2 KB)

pairit config upload experiment.yaml --name my-exp
# ✓ Attached slider.html (4.2 KB)
# ✓ Created my-exp (my-exp-k3f9x2m8q1), revision 1
```

Lint checks that each `src` exists, is a local `.html` file, is not a URL, and is under 1 MB. Upload attaches the file to the published config and includes it in the checksum. Compile does not attach file bytes. See [HTML](components/html.md).

## Media

```
pairit media upload hero.png
pairit media list --prefix onboarding/
pairit media delete onboarding/hero.png
```

Each upload goes in your own folder and returns a public URL. Use that URL in your config. Anyone with the URL can read the file, so do not upload sensitive files. `media list` shows only your files, and `media delete` deletes only your files. Files uploaded before per-researcher folders keep their URLs; ask an admin to delete one.

## Data Export

Export experiment data for analysis.

```zsh
pairit data export <configId>                    # Export as CSV (default)
pairit data export <configId> --format json      # Export as JSON
pairit data export <configId> --format jsonl     # Export as JSONL
pairit data export <configId> --out ./exports    # Custom output directory
```

Creates six files per export:

| File | Contents |
|------|----------|
| `{configId}-sessions.csv` | Session records: sessionId, configId, status, session_state.*, prolific.*, provenance, timestamps |
| `{configId}-events.csv` | Component events: sessionId, type, pageId, componentType, data.*, timestamp |
| `{configId}-chat-messages.csv` | Chat history: messageId, groupId, senderId, senderType, content, createdAt |
| `{configId}-groups.csv` | Group records: groupId, members, createdAt |
| `{configId}-survey-responses.csv` | Survey response data: sessionId, itemId, answer, pageId, timestamp |
| `{configId}-workspace-documents.csv` | Workspace documents: groupId, content, fields, updatedAt |

**Formats**: CSV flattens nested objects with dot notation (`session_state.treatment`). JSON/JSONL preserve full nesting.

In CSV, a text value that starts with `=`, `+`, `-`, `@`, a tab, or a carriage return gets a leading `'`, so Excel and Google Sheets show participant answers as text instead of running them as formulas. Numbers are unchanged. JSON and JSONL keep the original text.

**Provenance** columns in the sessions file show what each participant ran:

| Column | Meaning |
|--------|---------|
| `configRevision` | Config revision the session started on |
| `configChecksum` | Checksum of that compiled config |
| `labVersion` | Lab code version (git commit) that served the session |
| `labRevision` | Cloud Run revision that served the session |

Sessions created before provenance was recorded have empty values. Group or filter by these columns to separate participants across a mid-study config edit or lab deploy.

## Database layout (MongoDB)

Published configs live in the `configs` collection (keyed by `configId`) with `name`, `revision`, metadata and a checksum. Each revision's compiled config is kept in `config_revisions` (keyed by `configId` + `revision`). Runs create:
- `sessions` documents (keyed by `id`) → `{ configId, config, currentPageId, session_state, endedAt?, createdAt, updatedAt, userId?, configRevision, configChecksum, labVersion, labRevision }`
- `events` documents → `{ sessionId, configId, pageId, componentType, componentId, type, timestamp, data, createdAt }`

Use `pairit config get <configId>` to download a compiled config snapshot for auditing or debugging (where supported). Media objects live in the configured storage backend (local filesystem for dev, Google Cloud Storage in prod); `pairit media *` commands proxy uploads and deletes via the manager service so the CLI never requires direct GCP credentials. Public media uploads should use the stable asset URL returned by the manager service, not a temporary signed read URL.


