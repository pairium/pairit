# Matchmaking

Enqueue the current session into a server-managed pool until enough participants arrive to form a group. On match, the server initializes `session_state` (including `chat_group_id`). On timeout, it can auto-navigate to a fallback page. See the [Team Decision example](../examples.md#team-decision).

Pairit handles about 150 concurrent participants. Before launching a large matchmaking study, read [Running Large Studies](../guides/large-studies.md).

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `poolId` | string | `"default"` | Pool identifier for grouping participants |
| `num_users` | number | `2` | Number of participants required to form a group |
| `timeoutSeconds` | number | `120` | Seconds to wait before timeout |
| `timeoutTarget` | string | - | Page to navigate to on timeout |
| `onMatchTarget` | string | - | Page to navigate to on successful match |
| `assignmentType` | string | - | Treatment assignment type (random, balanced_random, block) |
| `conditions` | string[] | - | Treatment conditions to assign |

## timeoutTarget

When matchmaking times out, automatically navigate to a fallback page:

```yaml
components:
  - type: matchmaking
    props:
      num_users: 2
      timeoutSeconds: 120
      timeoutTarget: solo_experience  # Navigate here if no match found
      onMatchTarget: group_chat       # Navigate here on successful match
```

This enables graceful degradation:
- Matched participants → group experience
- Timed-out participants → solo experience or survey

## Events
- `onRequestStart`: emitted when matchmaking begins
- `onMatchFound`: emitted when a suitable group is found
- `onTimeout`: emitted when matchmaking times out
- `onCancel`: emitted if matchmaking is cancelled

Event Data
- `pool_id`: identifier of the matchmaking pool
- `group_size`: target group size (num_users)
- `wait_duration_seconds`: how long the session waited (onMatchFound/onTimeout)
- `group_id`: assigned group identifier (onMatchFound)
- Custom data can be added via `events.{eventName}.data`

Usage

```yaml
pages:
  - id: matchmaking
    components:
      - type: matchmaking
        id: group_matching
        props:
          num_users: 2
          timeoutSeconds: 120
        events:
          onRequestStart:
            type: "matchmaking_started"
            data:
              experiment_phase: "group_formation"
          onMatchFound:
            type: "matchmaking_success"
            data:
              experiment_phase: "group_formation"
          onTimeout:
            type: "matchmaking_timeout"
            data:
              experiment_phase: "group_formation"
    buttons:
      - id: continue
        text: "Continue"
        action:
          type: go_to
          branches:
            - when: "session_state.treated == true"
              target: chat_treated
            - target: chat_control
```

Pool config

```yaml
matchmaking:
  - id: default_pool
    num_users: 2
    timeoutSeconds: 120
```

## Share answers with the group

Each participant's `session_state` is private. To let group members see some of each other's answers, list those keys in the pool's `share`:

```yaml
matchmaking:
  - id: pairs
    num_users: 2
    share: [r1_estimate]
```

After the match, every page can read `group`:

| Path | What it is |
|------|------------|
| `group.others.0.r1_estimate` | The first other member's `r1_estimate`. Members are numbered in the order they joined, starting at 0, and you are left out. In a pair, `group.others.0` is your partner. |
| `group.ws.<field>` | A field of a structured `scope: group` [workspace](workspace.md#read-the-workspace-on-other-pages), from any page. |

Only keys in `share` are visible. Answers given before the match are shared once the group forms, and later changes show up live.

```yaml
pages:
  - id: discuss
    components:
      - type: text
        props:
          text: "You said {{session_state.r1_estimate}}. Your partner said {{group.others.0.r1_estimate}}."
      - type: text
        when: "group.others.0.r1_estimate > 50"
        props:
          text: "Your partner guessed higher than 50."
```

`group` works in text templates, `when:` conditions, button branches, [HTML embeds](html.md#read-the-group) (`read: [group]`) and [agent prompts](agents.md#template-interpolation). `pairit config lint` checks that each `group.others` key is in a `share` list and each `group.ws` field exists. Nothing is copied: the data export has each member's own `session_state` and the workspace, as before.

Notes
- Matching policy: FIFO by arrival; groups of `num_users`.
- On match: write `session_state.chat_group_id` and emit `match`.
- On timeout: emit `timeout`.


