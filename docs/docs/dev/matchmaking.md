# Matchmaking 

Optionally enable backfill to form groups using ghost seats when necessary.

> Note: Matchmaking is **not yet implemented** in the current Bun/Elysia + MongoDB stack in this repo. This page is a design note for the intended behavior.

Config extension

```yaml
matchmaking:
  - id: default_pool
    num_users: 2
    backfill:
      enabled: true
      policy: fifo
      ghostAgents:
        - agentId: default_agent
```

Auditing
- Record backfilled outcomes alongside other matchmaking outcomes.
- When a ghost seat is used, emit a `backfilled` event and persist the flag alongside the group record.

Runtime behavior
- Entering a `matchmaking` page enqueues the session in the specified pool (implementation TBD).
- Matching policy: FIFO by arrival time, fill groups of `num_users`.
- Timeout policy: configurable per pool (`timeoutSeconds`), defaulting to 120 seconds.
- On `match`, the runtime writes `$.user_group.chat_group_id` and `groupId`, then advances using routing defined on the button action.
- On `timeout`, the runtime emits a `timeout` event so routing branches can handle fallback pages.
- Backfill enables forming groups with fewer real participants by inserting configured ghost agents. Use sparingly and surface the outcome in analysis via the stored `backfilled` flag.


