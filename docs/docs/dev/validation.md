# Validation

Compilation
- Normalize page shapes and helpers into canonical components
- Validate props against schemas where applicable
- Record resolved custom component versions for audit
- Ensure survey questions define answer kinds and required choices

JSON Schema coverage
- Provide schemas for pages, user_state, group_state, matchmaking, agents, button actions
- Default additionalProperties: false unless opted-in
- Allow $ref within config only (no external refs)
- Pre-validate assignment paths (`$.user_state.*`) against declared schema
- Support inline schema reuse with `$defs`

Lints
- Unique ids across pages/matchmaking/agents
- Unique button ids per page
- go_to targets must reference existing pages
- Assign RHS types must match declared user_state targets
- Forbid assignments outside $.user_state.* from client events
- Unknown action.type values are errors
- Require declared component events for emitted payloads; unknown events follow `unknownEvents` policy
- Warn when an `end` page has outgoing edges


