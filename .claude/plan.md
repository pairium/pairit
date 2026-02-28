# P0 Documentation Plan (Issue #42)

## Overview
Document all completed P0 features to close out the P0 milestone. Based on git history analysis and codebase exploration, there are 18+ features across components, config, CLI, auth, and core concepts.

## Critical Priority (Empty/Missing Docs)

### 1. Fill agents.md (currently empty stub)
- Document AI agent component system
- Cover `agentId`, `systemPrompt`, `model` configuration
- Explain agent lifecycle and chat integration
- Reference chat.md for message handling

### 2. Complete concepts.md empty sections
Three sections are stubs with just headers:
- **Flow Logic**: Document page transitions, button targets, conditional navigation
- **Session State**: Document `session_state` object, state persistence, `stateKey` patterns
- **Randomization**: Document treatment assignment, conditions array, assignment types

### 3. Create randomization.md component doc
- Document Randomize component (side-effect component, no UI)
- Cover `assignmentType`: random, balanced_random, block
- Document `conditions` array and `stateKey` for persistence
- Link to concepts.md for theory

## High Priority (New Features)

### 4. Update chat.md with groupId and placeholder
- Document `groupId` for shared vs isolated chat contexts
- Add `placeholder` prop for input customization
- Update example configs

### 5. Document allowRetake and schema_version in config.md
- Add `allowRetake` field (boolean, default false)
- Explain session blocking vs retake behavior
- Document `schema_version` for config validation

### 6. Update button.md with highlightWhen
- Document `highlightWhen` conditional highlighting
- Show expression syntax examples

### 7. Document matchmaking timeoutTarget
- Add `timeoutTarget` to matchmaking.md
- Explain timeout navigation behavior

## Medium Priority (Improvements)

### 8. Add Installation page to docs
- Create getting-started.md or installation.md
- Cover prerequisites (Bun, MongoDB)
- Document environment variables
- Quick start commands

### 9. Create workspace.md
- Document monorepo structure
- Explain package relationships
- Cover development workflow

### 10. Create form.md component doc
- Document Form container component
- Cover validation, submission, state binding

### 11. Create data export guide
- Document manager CLI export commands
- Cover CSV, JSON, JSONL formats
- Show filtering and date range options

## Implementation Order

1. **concepts.md** - Fill 3 empty sections (foundational)
2. **agents.md** - Fill empty stub
3. **randomization.md** - Create new component doc
4. **chat.md** - Add groupId, placeholder
5. **config.md** - Add allowRetake, schema_version
6. **button.md** - Add highlightWhen
7. **matchmaking.md** - Add timeoutTarget
8. **getting-started.md** - New installation guide
9. **workspace.md** - New architecture doc
10. **form.md** - New component doc
11. **data-export.md** - New CLI guide

## Verification
- All docs render correctly in markdown
- Cross-references are valid
- Examples match actual implementation
- No P0 features left undocumented
