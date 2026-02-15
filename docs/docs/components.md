# Components

Component-first architecture

- Everything is a component: pages compose components.
- Special features are components: matchmaking, chat, live workspaces, and AI agents ship as first‑class components.
- Hierarchies and groups: components can nest. A component group wraps related subcomponents and exposes a concise config.
  - Survey: a `Survey` group manages a sequence of `SurveyQuestion` components, including paging and validation.
  - ButtonGroup: coordinates multiple `Button` components with shared behavior.
- Declarative YAML: declare components, their props, and layout. YAML mirrors JSX structure.
- Chat and agents:
  - A `chat` component can run solo.
  - Attach an AI agent by listing it in `props.agents`.
  - Or use `matchmaking` to assign a `groupId`, then join chat rooms shared by that group.
- Live workspaces: a `live-workspace` component plugs into pages like any other component.

- Events: all interactive components automatically emit structured events for research data collection. Configure custom event metadata to capture experiment-specific details.
  - Button clicks, survey submissions, media interactions, matchmaking lifecycle, chat messages, and form changes all generate trackable events.
  - Events include standard metadata (sessionId, pageId, componentId) plus configurable custom data.

Result: a consistent, declarative system where pages stay lightweight and features drop in as components.

## Available Components

| Component | Description |
|-----------|-------------|
| [Text](components/text.md) | Display text and markdown content |
| [Buttons](components/buttons.md) | Navigation and action buttons |
| [Survey](components/survey.md) | Multi-question forms with validation |
| [Form](components/form.md) | General-purpose form fields |
| [Chat](components/chat.md) | Real-time messaging |
| [Matchmaking](components/matchmaking.md) | Group participants together |
| [Randomization](components/randomization.md) | Assign treatment conditions |
| [Agents](components/agents.md) | Server-hosted AI agents |
| [Media](components/media.md) | Images, videos, and audio |
| [Workspace](components/workspace.md) | Collaborative workspaces |
| [Custom](components/custom.md) | Mount custom React components |

## Runtime adapters

- Each interactive component owns a `*.runtime.ts` adapter colocated with its UI module. Example: `apps/lab/app/src/components/ui/Button/runtime.tsx` registers the button runtime wrapper and handles event submission.
- UI modules and their adapters live in PascalCase directories (`Button/Button.tsx`, `Button/runtime.tsx`) so the filesystem mirrors React component naming and stays stable on case-insensitive hosts.
- Adapters call `defineRuntimeComponent()` (see `apps/lab/app/src/runtime/define-runtime-component.ts`) to register renderers with the runtime registry without pulling registry code into UI files.
- `apps/lab/app/src/components/runtime.ts` imports every adapter for side effects so the bundle includes all registrations. Adding a new component means updating its UI module, creating the matching runtime adapter, then adding one import line to this manifest.
- Component-owned normalization or validation can live inside the adapter by extending the returned object, keeping the central runtime agnostic of component specifics.