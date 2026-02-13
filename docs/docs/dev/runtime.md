# Runtime

The runtime consumes the canonical JSON produced by the compiler and turns each page into a live React view. The config never instantiates React components directly; instead the runtime uses a registry to look up implementations by id and hands them validated props.

## Component lookup and rendering

```tsx
export const componentRegistry = {
  text: TextBlock,
  buttons: ButtonsRow,
  button: Button,
  survey: SurveyForm,
  matchmaking: MatchmakingPanel,
  chat: ChatView,
  media: MediaBlock,
  form: GenericForm,
  component: YourCustomComponentHost,
  default: FallbackComponent,
};

export function renderPage(page, context) {
  const Component = componentRegistry[page.componentType] ?? componentRegistry.default;
  const props = parseProps(page.props);
  return <Component {...props} />;
}
```

Key points:
- Page nodes are normalized at compile time so the renderer always receives `{ componentType, props }` pairs for shorthand helpers like `text` or `buttons`.
- `parseProps` applies runtime-only defaults (for example, filling in optional arrays) and surfaces schema validation errors early.
- The default entry exists so unknown component types render an explicit “missing renderer” placeholder rather than crashing.
- Custom components use the `component` host. The host reads the component id from props, checks the registry for a matching implementation, and enforces the contract declared in the config (`propsSchema`, events, capabilities).

## Routing context

Pages advance through a lightweight routing context. Actions that arrive from components or button clicks are funneled into `advance`, which resolves a target page id using any conditional branches defined in the action.

```ts
type Event = { type: string; payload?: any };

export const RoutingContext = React.createContext({
  currentPageId: null as string | null,
  advance: async (_event: Event) => {},
});

function resolveBranch(action, context) {
  if (!action.branches || action.branches.length === 0) return action.target;
  for (const branch of action.branches) {
    if (!branch.when) return branch.target;
    const truthy = evaluate(branch.when, context);
    if (truthy) return branch.target;
  }
  throw new Error('No branch matched and no default provided');
}
```

The evaluation context exposes `$event`, `$.user_state`, `$.user_group`, `$.env`, `$.now`, and `$.run`, matching the expression subset described in the configuration guide.

## User store context

The runtime keeps session state in a user store. Components can request assignments through events, and compiled survey components write answers automatically to `$.user_state` using question ids.

```ts
type UserStore = Record<string, any>;

export const UserStoreContext = React.createContext({
  state: {} as UserStore,
  assign: (_path: string, _value: any) => Promise.resolve(),
  bulkAssign: (_patch: Record<string, any>) => Promise.resolve(),
});
```

The compiler validates assignment targets against the schema declared in the config. At runtime `assign` and `bulkAssign` are the only safe mutation APIs exposed to components. The store implementation persists changes to MongoDB (via the Lab Server API) and feeds expression evaluation so routing decisions can depend on updated answers or matchmaking outcomes.


## Local vs remote config loading

The client can run in two modes for a given `/:experimentId` route:

- Local mode: load a static JSON config from the app host
- Remote mode: start a server session and stream state from the API

Flow:

1) The client attempts to fetch `/configs/{experimentId}.json`.
   - If the file exists and validates, the app enters local mode and renders directly from that config.

2) If the local fetch fails, the client calls `${VITE_API_URL}/sessions/start` with `{ configId: experimentId }`.
   - On success, the app enters remote mode, holds a `sessionId`, and uses the API for `get` and `advance` operations.

Environment:

- Set `VITE_API_URL` in `apps/lab/app/.env.local` (dev) or via build args (prod) to point at your Lab Server base URL.
  - Example (native dev): `VITE_API_URL=http://localhost:3001`
  - Example (deployed): `VITE_API_URL=https://<your-lab-service-host>`

Local files:

- Vite serves files from `apps/lab/app/public`. Place configs under `apps/lab/app/public/configs/` so they resolve at `/configs/{id}.json`.
  - Example: `apps/lab/app/public/configs/survey-showcase.json` → `/:experimentId=survey-showcase` loads in local mode.

Troubleshooting:

- If local mode is not picked up, confirm the file path and that the JSON validates against the runtime normalizer.
- If remote mode fails to start, check `VITE_API_URL` and the network response from `POST /sessions/start`.
- Remote mode requires the config to be uploaded to the server store with a `configId` that matches the URL segment.
