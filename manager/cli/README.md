# Pairit CLI

A lightweight command line utility for working with Pairit experiment configuration files. It exposes:

- `lint` — run minimal validation (schema_version, initialNodeId, pages)
- `compile` — normalize a YAML config and emit sibling canonical JSON
- `upload` — compile and upload a config through the manager Firebase Function
- `list` — list configs stored via the manager Firebase Function
- `delete` — delete a stored config

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
pairit lint path/to/config.yaml
pairit compile path/to/config.yaml
pairit upload configs/simple-survey-basic.yaml --owner you@example.com
pairit list --owner you@example.com
pairit delete simple-survey-basic
```

### Example

```zsh
# Using the Firebase emulator (requires `firebase emulators:start --only functions,firestore`)
export PAIRIT_FUNCTIONS_BASE_URL=http://127.0.0.1:5001/pairit-local/us-central1/api
node manager/cli/dist/index.js upload configs/simple-survey-basic.yaml --owner you@example.com
node manager/cli/dist/index.js list
node manager/cli/dist/index.js delete simple-survey-basic --force
```

`compile` writes `configs/simple-survey-basic.json` next to the source YAML. The hosted commands require the manager Firebase Function to be running (local emulator or deployed environment). Set `PAIRIT_FUNCTIONS_BASE_URL` to point to the desired target. When unset, the CLI falls back to `http://127.0.0.1:5001/<project>/us-central1/api`, where `<project>` is read from `FIREBASE_CONFIG.projectId` or `GCLOUD_PROJECT`.

## Development

```zsh
pnpm --filter pairit-cli run dev
pnpm --filter pairit-cli run lint
```

`dev` runs `tsup` in watch mode to rebuild on changes. `lint` type-checks the TypeScript sources.

