# Matchmaking

Enqueue the current session into a server-managed pool until enough participants arrive to form a group. On match, the server initializes `$.user_group` (including `chat_group_id`). On timeout, it emits a timeout outcome.

Usage

```yaml
pages:
  - id: matchmaking
    matchmaking: default_pool
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


