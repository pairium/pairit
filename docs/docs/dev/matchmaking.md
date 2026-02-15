# Matchmaking

Server-side matchmaking groups participants into pools before chat or collaborative tasks.

## Pool Configuration

```yaml
matchmaking:
  - id: default_pool
    num_users: 2
    timeoutSeconds: 120
    timeoutTarget: solo_fallback
    assignment:
      type: balanced_random
      conditions: [control, treatment]
```

## Matching Policy

- **FIFO**: Participants matched in arrival order
- **Group size**: Forms groups of exactly `num_users`
- **Timeout**: After `timeoutSeconds`, unmatched participants receive `match_timeout` event

## State Written on Match

When a group forms, these values are written to each participant's `user_state`:

| Key | Value |
|-----|-------|
| `group_id` | Shared group identifier |
| `chat_group_id` | Chat room identifier (same as group_id) |
| `treatment` | Assigned condition (if `assignment` configured) |

## Navigation

- **On match**: If `onMatchTarget` is set, auto-navigate there
- **On timeout**: If `timeoutTarget` is set, auto-navigate there

## Auditing

All matchmaking outcomes are logged:
- `match_found` events include `groupId`, `treatment`, `memberCount`
- `match_timeout` events include `poolId`, `waitDurationSeconds`
