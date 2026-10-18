# Changelog

Two kinds of releases appear here:

- **Platform YYYY.MM.DD**: the lab and the manager server. Released each time production is deployed. Nothing to upgrade.
- **CLI X.Y.Z**: the `pairit` command-line tool on npm. Upgrade with:

    ```bash
    npm install -g pairit
    ```

Full release notes are on [GitHub Releases](https://github.com/pairium/pairit/releases).

## Unreleased

Merged, but not released yet.

### Platform

- Chat avatars can come from `session_state`, e.g. a different avatar per group member with a distributed randomization. Avatars are now a single string (icon name or image path); the old `{ icon, image }` form still works. See [Avatars from session state](components/chat.md#avatars-from-session-state).

### CLI

## CLI 0.3.2

[Release notes](https://github.com/pairium/pairit/releases/tag/cli-v0.3.2)

- `pairit config lint` checks randomization that uses `distribute: true`: it needs `scope: group`, and its `conditions` list must have one entry per group member. See [Different roles within a group](components/randomization.md#different-roles-within-a-group).

## CLI 0.3.1

[Release notes](https://github.com/pairium/pairit/releases/tag/cli-v0.3.1)

- In a split layout, `pairit config lint` checks that each component's `column` is `left` or `right`. See [Split layout](configuration.md#split-layout).
- `--env staging` and `--env production` now take precedence over `PAIRIT_API_URL`.

## CLI 0.3.0

[Release notes](https://github.com/pairium/pairit/releases/tag/cli-v0.3.0)

- Upload configs with `--name` instead of `--config-id`. Pairit builds the participant link from the name with a random suffix, e.g. `my-study-k3f9x2m8q1`.
- Re-uploading under the same name keeps the link and saves a new revision. The CLI warns you if participants already ran the previous one.
- `pairit config history <configId>` lists revisions and their session counts.
- The sessions export has a `configRevision` column.

Existing links don't change. See [Names, links, and revisions](cli.md#names-links-and-revisions).
