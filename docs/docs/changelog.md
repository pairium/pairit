# Changelog

Releases of the `pairit` CLI. Upgrade with:

```bash
npm install -g pairit
```

Full release notes are on [GitHub Releases](https://github.com/pairium/pairit/releases).

## CLI 0.3.0

[Release notes](https://github.com/pairium/pairit/releases/tag/cli-v0.3.0)

- Upload configs with `--name` instead of `--config-id`. Pairit builds the participant link from the name with a random suffix, e.g. `my-study-k3f9x2m8q1`.
- Re-uploading under the same name keeps the link and saves a new revision. The CLI warns you if participants already ran the previous one.
- `pairit config history <configId>` lists revisions and their session counts.
- The sessions export has a `configRevision` column.

Existing links don't change. See [Names, links, and revisions](cli.md#names-links-and-revisions).
