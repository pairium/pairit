# CLI

Validate, simulate, and publish experiment configs.

Basic usage

```zsh
pairit config lint your_experiment.yaml # Validate YAML and run lints
pairit config compile your_experiment.yaml # Parse and compile to canonical JSON
```

Publish / manage on Firestore

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

## Firestore layout

Published configs live under `configs/{configId}` with metadata and a checksum. Runs create:
- `sessions/{sessionId}` → `{ currentPageId, user_state, user_group, endedAt? }`
- `groups/{groupId}` when matchmaking succeeds (shared state across participants)
- `events/{eventId}` (optional audit trail)

Chat transcripts stream through RTDB at `chats/{chat_group_id}`. Use `pairit config get <configId>` to download a compiled config snapshot for auditing or debugging. Media objects live in Google Cloud Storage buckets configured for the deployment; `pairit media *` commands proxy uploads and deletes via the manager service so the CLI never requires direct GCP credentials. Bucket selection happens in the backend (via `PAIRIT_MEDIA_BUCKET`); use `--bucket <name>` only when overriding that default. Uploads are public unless you pass `--private` when calling `pairit media upload`.

## Authentication

All manager API endpoints require Firebase Authentication. The CLI provides authentication commands to manage your credentials.

### Commands

- `pairit auth login` - Authenticate with email/password (Google Sign-In coming soon)
- `pairit auth logout` - Clear stored authentication token
- `pairit auth status` - Check authentication status

### Setup for Firebase Emulator (Local Development)

When testing with Firebase emulators, set these environment variables:

```bash
export USE_FIREBASE_EMULATOR=true
export FIREBASE_PROJECT_ID=pairit-lab
export PAIRIT_FUNCTIONS_BASE_URL=http://127.0.0.1:5001/pairit-lab/us-east4/manager
```

Then run:
```bash
pairit auth login
```

The CLI will automatically use the emulator at `http://localhost:9099` with the fake API key.

### Setup for Production

Set these environment variables:

```bash
export FIREBASE_API_KEY=your-actual-api-key
export FIREBASE_AUTH_DOMAIN=pairit-lab.firebaseapp.com
export FIREBASE_PROJECT_ID=pairit-lab
export PAIRIT_FUNCTIONS_BASE_URL=https://your-deployed-function-url
```

Then run:
```bash
pairit auth login
```

### Troubleshooting

**Error: "API key not valid"**
- Make sure `USE_FIREBASE_EMULATOR=true` is set for emulator usage
- Or set `FIREBASE_API_KEY` with a valid production API key

**Error: "Authentication required"**
- Run `pairit auth login` first
- Check that token is stored: `cat ~/.config/pairit/auth.json`

**Error: "Connection refused"**
- Make sure Firebase emulators are running
- Check that Auth emulator is on port 9099


