# CLI

Validate, simulate, and publish experiment configs.

Basic usage

```zsh
pairit lint your_experiment.yaml # Validate YAML and run lints
pairit compile your_experiment.yaml # Parse and compile to canonical JSON
```

Publish / manage on Firestore

```zsh
pairit publish your_experiment.yaml --owner alice@example.com
pairit list --owner alice@example.com
pairit get <configId> --out compiled.json # TODO
pairit delete <configId>
```

Coming soon

```zsh
pairit simulate --seed 42 your_experiment.yaml
```


