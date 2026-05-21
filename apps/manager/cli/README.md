# Pairit CLI

A lightweight command line utility for working with Pairit experiment configuration files and media assets. It exposes grouped commands:

- `login` — authenticate with Google OAuth (required for all hosted commands)
- `config lint` — run minimal validation (schema_version, initialPageId, pages)
- `config compile` — normalize a YAML config and emit sibling canonical JSON
- `config upload` — compile and upload a config through the manager service, optionally with per-experiment LLM provider keys
- `config list` — list configs stored via the manager service
- `config delete` — delete a stored config
- `media upload` — upload a binary asset to Cloud Storage via the manager service (uploads are public unless `--private` is passed; public uploads return a stable asset URL when the backend supports it)
- `media list` — list media objects in Cloud Storage
- `media delete` — delete a media object from Cloud Storage
- `data export` — export sessions, events, and chat messages for a config as CSV/JSON/JSONL
- `admin add-user` / `admin remove-user` / `admin list-users` — manage the manager allowlist (admin role required)

## Install
   
```bash
bun install
```

You can invoke the CLI directly using Bun:

```bash
bun run src/index.ts --help
```

### Link globally (optional)

```bash
cd apps/manager/cli
bun link
```

This makes `pairit` available globally from the `bin` field in package.json.

## Usage

```bash
pairit login                                       # Authenticate (required first)
# On a remote/headless server, open the printed URL locally and paste back the one-time code

pairit config lint path/to/config.yaml
pairit config compile path/to/config.yaml
pairit config upload configs/simple-survey-basic.yaml --config-id simple-survey-basic
pairit config upload configs/agent-study.yaml --config-id agent-study --openai-api-key sk-...
pairit config list
pairit config delete 2f3c4d5e...

pairit media upload assets/video.mp4 --content-type video/mp4
pairit media list --prefix onboarding/
pairit media delete onboarding/intro.mp4

pairit data export <configId>                      # Export as CSV to current dir
pairit data export <configId> --format json        # Export as JSON
pairit data export <configId> --format jsonl       # Export as JSONL
pairit data export <configId> --out ./exports      # Export to specific directory
```

Add `--private` if you need to keep an object private. Use `--bucket <name>` only when you need to override the backend default.

### Example

```bash
# Point to local manager server (default is http://localhost:3002)
export PAIRIT_API_URL=http://localhost:3002

bun run apps/manager/cli/src/index.ts config upload configs/simple-survey-basic.yaml --config-id simple-survey-basic
bun run apps/manager/cli/src/index.ts config upload configs/agent-study.yaml --config-id agent-study --openai-api-key sk-...
bun run apps/manager/cli/src/index.ts config list
bun run apps/manager/cli/src/index.ts config delete 2f3c4d5e... --force

bun run apps/manager/cli/src/index.ts media upload assets/logo.png
bun run apps/manager/cli/src/index.ts media list
bun run apps/manager/cli/src/index.ts media delete onboarding/logo.png --force
```

`config compile` writes `configs/simple-survey-basic.json` next to the source YAML. `config upload` defaults the config id to a 16-character base64url string derived from the SHA-256 hash of the compiled JSON (unless `--config-id` overrides it).

## Manager allowlist (admin)

Manager sign-ins are gated on a Mongo allowlist. Anyone who isn't on it lands on `/access-denied` after Google sign-in. Use these commands to manage who can sign in. The calling CLI user must be an admin.

```bash
pairit admin list-users                            # Show everyone on the allowlist
pairit admin add-user alice@example.com            # Add as researcher
pairit admin add-user bob@example.com --admin      # Add as admin (can manage the allowlist)
pairit admin remove-user alice@example.com         # Remove and revoke their sessions
pairit admin remove-user alice@example.com --force # Skip confirmation prompt
```

Notes:
- Bootstrap: `MANAGER_BOOTSTRAP_ADMIN_EMAIL` is seeded as admin on every manager boot. Set it before the first deploy or you'll have no admins.
- Day-1 migration: on first boot, existing config owners are backfilled as researchers (not the entire user collection, which is shared with lab participants).
- Self-removal is blocked.
- The rejection page contact is set by `MANAGER_ADMIN_CONTACT_EMAIL` (defaults to `harang@pairium.ai`).

## Per-experiment LLM credentials

If your config uses AI agents, attach provider credentials when uploading:

```bash
pairit config upload path/to/config.yaml --config-id my-exp --openai-api-key sk-...
pairit config upload path/to/config.yaml --config-id my-exp --anthropic-api-key sk-ant-...
```

Notes:
- Keys are stored per config, encrypted at rest by the manager server.
- Re-uploading the same `configId` without a new key keeps the previously stored key for that config.
- That means billing continues on the experimenter's previously uploaded key, not on a shared platform key.
- If an agent uses `gpt-*` and the config has no OpenAI key, the run fails.
- If an agent uses `claude*` and the config has no Anthropic key, the run fails.
- There is no global platform-key fallback for experiment agent execution.

`data export` creates three files in the output directory:
- `{configId}-sessions.{format}` — session ID, user_state fields (flattened), timestamps, status
- `{configId}-events.{format}` — session ID, event type, component info, payload, timestamps
- `{configId}-chat-messages.{format}` — group ID, session ID, sender, content, timestamps

All hosted commands require the manager service to be reachable (Cloud Run deployment or local server). By default the CLI talks to the deployed manager. Override via shell environment variables when needed:

- `PAIRIT_API_URL` — manager base URL (e.g. `http://localhost:3002` for local dev)
- `PAIRIT_LAB_URL` — lab base URL used to print the survey link after `config upload`
- `PAIRIT_CREDENTIALS_BACKEND` — `keychain` (default when available) or `file`
- `PAIRIT_MAX_INLINE_MEDIA_BYTES` — switch to signed-URL upload above this size (default 5 MiB)

```bash
PAIRIT_API_URL=http://localhost:3002 pairit config list
```

## Development

```bash
cd apps/manager/cli
bun run dev
bun run lint
```

`dev` runs in watch mode. `lint` type-checks the TypeScript sources.

