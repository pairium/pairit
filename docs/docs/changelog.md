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

- The manager answers an unknown address with 404 and a request it can't read with 422, instead of 500 for every error. CLI errors now say which it was.
- Likert scales can label their two ends with `min_label` and `max_label` (e.g. "Not at all" … "Extremely") instead of "Strongly disagree" … "Strongly agree". The survey docs now also show how to relabel every point with `choices`.

## CLI 0.3.5

[Release notes](https://github.com/pairium/pairit/releases/tag/cli-v0.3.5)

- `pairit admin activity` names studies whose open sessions are too old to count as active, and says how active is defined.

## Platform 2026.10.27.3

[Release notes](https://github.com/pairium/pairit/releases/tag/platform-v2026.10.27.3)

- For admins: the activity report no longer counts a session as active if it started more than 12 hours ago. A browser tab left open on a page whose `html` component saves on a timer kept such a session looking live for days. The report lists these as `staleOpen`.

## Platform 2026.10.27.2

[Release notes](https://github.com/pairium/pairit/releases/tag/platform-v2026.10.27.2)

- For admins: the manager reports which studies have participants right now (`GET /admin/activity`), so production deploys can wait for live group studies to finish.
- A participant who starts the same study twice at once (two tabs, a quick reload) now gets one session instead of two. Before, both starts could create a session, so the sessions export could list a participant twice, one of them stuck on the first page.

## CLI 0.3.4

[Release notes](https://github.com/pairium/pairit/releases/tag/cli-v0.3.4)

- `pairit admin activity` (admins) lists studies with recent sessions: owner, active participants in a group or solo, how many wait in matchmaking, and features used. Live group studies come first. `--since 7d` looks further back, `--json` prints the raw report, and `--fail-if-live` exits 2 if a group study is live.

## Platform 2026.10.27

[Release notes](https://github.com/pairium/pairit/releases/tag/platform-v2026.10.27)

- The workspace is now live-synced: participants and agents can edit at the same time without losing each other's work. The editor shows markdown formatted, like a document, instead of a plain text box, and highlights text an agent just added. Agents see `initialContent` before anyone edits, and their edits are recorded as `agent:<agentId>`. See [Workspace](components/workspace.md).
- Each group-scoped workspace now has its own document per page. Before, two group workspaces on different pages shared one. Group workspaces saved before this release start fresh; per-participant ones carry over.
- The workspace data export adds who wrote each part of the final text, and a full log of every change. See [Data Export](components/workspace.md#data-export).
- The server no longer logs a `workspace_edit` event with the full text on every save; the change log replaces it. A workspace's `onEdit` event still fires if you set one.
- Agents listed on a workspace now edit it with file tools, like coding agents: they view the file, make targeted edits, and see each result, for up to 8 steps per reply. No tool declarations needed; an existing `write_workspace` declaration is ignored for these agents. See [Agent Integration](components/workspace.md#agent-integration).
- Agents use OpenAI's Responses API, so `gpt-6-luna` agents can use tools together with `reasoningEffort`.
- An agent listed on both a page's chat and its workspace now replies once per message instead of twice.
- A workspace can be any text file (`file: board.json`), drawn by your own HTML page (`renderer`) and checked against a JSON Schema (`schema`). See [Custom renderer](components/workspace.md#custom-renderer).
- New examples: [Shared workspace](examples.md#shared-workspace) and [Workspace board](examples.md#workspace-board).

## CLI 0.3.3

[Release notes](https://github.com/pairium/pairit/releases/tag/cli-v0.3.3)

- `pairit config upload` bundles a workspace's `renderer` and `schema` files, and `pairit config lint` checks they exist.
- `pairit data export` also writes `<configId>-workspace-updates`, and the workspace documents file gains `authorship`, `fieldAuthors` and `updateCount`. See [Data Export](components/workspace.md#data-export).

## Platform 2026.10.18

[Release notes](https://github.com/pairium/pairit/releases/tag/platform-v2026.10.18)

- Chat avatars can come from `session_state`, e.g. a different avatar per group member with a distributed randomization. See [Avatars from session state](components/chat.md#avatars-from-session-state).
- Action needed: an avatar is now a single string, an icon name or an image path. Replace `avatar: { icon: bot }` with `avatar: bot`, and `avatar: { image: /a.png }` with `avatar: /a.png`, in agents and in chat `avatars`. The old form no longer works; it shows the default avatar.
- New example: [Fruit split demo](examples.md#fruit-split).

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
