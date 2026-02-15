# CLI

Validate, simulate, and publish experiment configs.

Basic usage

```zsh
pairit config lint your_experiment.yaml # Validate YAML and run lints
pairit config compile your_experiment.yaml # Parse and compile to canonical JSON
```

Publish / manage configs (stored in MongoDB via the Manager Server API)

```zsh
pairit config upload your_experiment.yaml --owner alice@example.com
pairit config list --owner alice@example.com
pairit config get <configId> --out compiled.json # TODO
pairit config delete <configId>
```

Coming soon

```zsh
pairit simulate --seed 42 your_experiment.yaml
```

## Compilation output

- Normalizes helper shorthands (`text`, `buttons`, `componentType`) into canonical component entries.
- Expands survey questions so each answer has a declared type (and required choices for `multiple_choice`).
- Resolves custom component references and records the version used at publish time for auditing.

Compiled JSON can be written with `--out <file>` to inspect what the runtime will consume.

## Validation & lints

`pairit config lint` runs structural checks before you publish:
- Validate props against JSON Schemas declared in components.
- Enforce unique ids across `pages`, `matchmaking`, and `agents`.
- Require unique button ids per page and ensure every `go_to`/branch target exists.
- Verify `assign` statements only touch `$.user_state.*` and that RHS types match the schema.
- Reject unknown `action.type` values and undeclared component events.

## Media

```
pairit media upload hero.png
pairit media list --prefix onboarding/
pairit media delete onboarding/hero.png
```

## Data Export

Export experiment data for analysis.

```zsh
pairit data export <configId>                    # Export as CSV (default)
pairit data export <configId> --format json      # Export as JSON
pairit data export <configId> --format jsonl     # Export as JSONL
pairit data export <configId> --out ./exports    # Custom output directory
```

Creates three files per export:

| File | Contents |
|------|----------|
| `{configId}-sessions.csv` | Session records: sessionId, configId, status, user_state.*, prolific.*, timestamps |
| `{configId}-events.csv` | Component events: sessionId, type, pageId, componentType, data.*, timestamp |
| `{configId}-chat-messages.csv` | Chat history: messageId, groupId, senderId, senderType, content, createdAt |

**Formats**: CSV flattens nested objects with dot notation (`user_state.treatment`). JSON/JSONL preserve full nesting.

## Database layout (MongoDB)

Published configs live in the `configs` collection (keyed by `configId`) with metadata and a checksum. Runs create:
- `sessions` documents (keyed by `id`) → `{ configId, currentPageId, user_state, endedAt?, createdAt, updatedAt, userId? }`
- `events` documents → `{ sessionId, configId, pageId, componentType, componentId, type, timestamp, data, createdAt }`

Use `pairit config get <configId>` to download a compiled config snapshot for auditing or debugging (where supported). Media objects live in the configured storage backend (local filesystem for dev, Google Cloud Storage in prod); `pairit media *` commands proxy uploads and deletes via the manager service so the CLI never requires direct GCP credentials.


