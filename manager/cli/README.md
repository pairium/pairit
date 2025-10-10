# Pairit CLI

A lightweight command line utility for working with Pairit experiment configuration files. It currently exposes two commands:

- `lint` — run minimal validation (schema_version, initialNodeId, pages)
- `compile` — normalize a YAML config and emit sibling canonical JSON

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
pnpm --filter pairit-cli link --global
pairit --help
```

## Usage

```zsh
pairit lint path/to/config.yaml
pairit compile path/to/config.yaml
```

### Example

```zsh
node manager/cli/dist/index.js lint configs/simple-survey-basic.yaml
node manager/cli/dist/index.js compile configs/simple-survey-basic.yaml
```

`compile` writes `configs/simple-survey-basic.json` next to the source YAML.

## Development

```zsh
pnpm --filter pairit-cli run dev
pnpm --filter pairit-cli run lint
```

`dev` runs `tsup` in watch mode to rebuild on changes. `lint` type-checks the TypeScript sources.

