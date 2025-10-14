# Pairit CLI

A lightweight command line utility for working with Pairit experiment configuration files and media assets. It exposes grouped commands:

- `config lint` — run minimal validation (schema_version, initialPageId, pages)
- `config compile` — normalize a YAML config and emit sibling canonical JSON
- `config upload` — compile and upload a config through the manager service
- `config list` — list configs stored via the manager service
- `config delete` — delete a stored config
- `media upload` — upload a binary asset to Cloud Storage via the manager service (uploads are public unless `--private` is passed; the backend selects the bucket unless you override with `--bucket`)
- `media list` — list media objects in Cloud Storage
- `media delete` — delete a media object from Cloud Storage

## Install

```zsh
pnpm install
pnpm --filter pairit-cli run build
```

You can invoke the CLI directly from the workspace without publishing:

```zsh
node manager/cli/dist/index.js --help
```

### Link locally (optional)

```zsh
pnpm --filter pairit-cli run build
pnpm --dir manager/cli link --global
pairit --help
```

> Tip: alternatively, `cd manager/cli && pnpm link --global` achieves the same result.

## Usage

```zsh
pairit config lint path/to/config.yaml
pairit config compile path/to/config.yaml
pairit config upload configs/simple-survey-basic.yaml --owner you@example.com
pairit config list --owner you@example.com
pairit config delete 2f3c4d5e...

pairit media upload assets/video.mp4 --content-type video/mp4
pairit media list --prefix onboarding/
pairit media delete onboarding/intro.mp4
```

Add `--private` if you need to keep an object private. Use `--bucket <name>` only when you need to override the backend default.

### Example

```zsh
# Using the Firebase emulator (requires `firebase emulators:start --only functions,firestore`)
export PAIRIT_FUNCTIONS_BASE_URL=http://127.0.0.1:5001/pairit-lab/us-east4/lab
node manager/cli/dist/index.js config upload configs/simple-survey-basic.yaml --owner you@example.com
node manager/cli/dist/index.js config list
node manager/cli/dist/index.js config delete 2f3c4d5e... --force

node manager/cli/dist/index.js media upload assets/logo.png
node manager/cli/dist/index.js media list
node manager/cli/dist/index.js media delete onboarding/logo.png --force
```

`config compile` writes `configs/simple-survey-basic.json` next to the source YAML. `config upload` defaults the config id to a 16-character base64url string derived from the SHA-256 hash of the compiled JSON (unless `--config-id` overrides it), which prevents duplicate uploads while keeping ids short. `media upload` base64-encodes the local file, derives a default object path from the file hash (preserving the extension), and forwards the payload to the manager Cloud Run service which writes to Cloud Storage. Pass `--object` to control the destination path or add `--private` to keep the object private (the backend may enforce policy constraints).

Media commands rely on the manager service configuration (`PAIRIT_MEDIA_BUCKET`) to pick a bucket; pass `--bucket <name>` only when overriding that default. Uploads are public by default—add `--private` to keep an object private.

All hosted commands require the manager service to be reachable (Cloud Run deployment or local emulator). Set `PAIRIT_FUNCTIONS_BASE_URL` to point to the desired target. When unset, the CLI falls back to `http://127.0.0.1:5001/<project>/us-east4/api`, where `<project>` is read from `FIREBASE_CONFIG.projectId` or `GCLOUD_PROJECT`.

## Development

```zsh
pnpm --filter pairit-cli run dev
pnpm --filter pairit-cli run lint
```

`dev` runs `tsup` in watch mode to rebuild on changes. `lint` type-checks the TypeScript sources.

