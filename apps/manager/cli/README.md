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
   
```bash
bun install
```

You can invoke the CLI directly using Bun:

```bash
bun run src/index.ts --help
```

### Link locally (optional)

```bash
cd apps/manager/cli
bun link
# in another dir
bun link pairit-cli
```

## Usage

```bash
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

```bash
# Point to local manager server (default is http://localhost:3002)
export PAIRIT_API_URL=http://localhost:3002

bun run apps/manager/cli/src/index.ts config upload configs/simple-survey-basic.yaml --owner you@example.com
bun run apps/manager/cli/src/index.ts config list
bun run apps/manager/cli/src/index.ts config delete 2f3c4d5e... --force

bun run apps/manager/cli/src/index.ts media upload assets/logo.png
bun run apps/manager/cli/src/index.ts media list
bun run apps/manager/cli/src/index.ts media delete onboarding/logo.png --force
```

`config compile` writes `configs/simple-survey-basic.json` next to the source YAML. `config upload` defaults the config id to a 16-character base64url string derived from the SHA-256 hash of the compiled JSON (unless `--config-id` overrides it).

All hosted commands require the manager service to be reachable (Cloud Run deployment or local server). Set `PAIRIT_API_URL` to point to the desired target. When unset, the CLI defaults to `http://localhost:3002`.

## Development

```bash
cd apps/manager/cli
bun run dev
bun run lint
```

`dev` runs in watch mode. `lint` type-checks the TypeScript sources.

