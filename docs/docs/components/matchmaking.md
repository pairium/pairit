# Matchmaking

Enqueue the current session into a server-managed pool until enough participants arrive to form a group. On match, the server initializes `$.user_group` (including `chat_group_id`). On timeout, it emits a timeout outcome.

Events
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
            - when: "$.user_state.treated == true"
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

Notes
- Matching policy: FIFO by arrival; groups of `num_users`.
- On match: write `$.user_group.chat_group_id` and emit `match`.
- On timeout: emit `timeout`.


