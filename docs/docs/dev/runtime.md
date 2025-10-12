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
- The default entry must exist so unknown component types raise an explicit `missing_component` error rather than crashing.
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

The compiler validates assignment targets against the schema declared in the config. At runtime `assign` and `bulkAssign` are the only safe mutation APIs exposed to components. The store implementation persists changes to Firestore and feeds expression evaluation so routing decisions can depend on updated answers or matchmaking outcomes.

