# Matchmaking 

Optionally enable backfill to form groups using ghost seats when necessary.

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


