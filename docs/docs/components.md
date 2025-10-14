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


