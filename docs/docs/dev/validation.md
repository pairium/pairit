# Validation

Compilation
- Normalize page shapes and helpers into canonical components
- Validate props against schemas where applicable

JSON Schema coverage
- Provide schemas for pages, user_state, group_state, matchmaking, agents, button actions
- Default additionalProperties: false unless opted-in
- Allow $ref within config only (no external refs)

Lints
- Unique ids across pages/matchmaking/agents
- Unique button ids per page
- go_to targets must reference existing pages
- Assign RHS types must match declared user_state targets
- Forbid assignments outside $.user_state.* from client events
- Unknown action.type values are errors


