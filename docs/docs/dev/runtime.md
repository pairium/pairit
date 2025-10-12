# Runtime

UI renderer maps config to registered React components and wires actions.

Example mapping

```tsx
export function renderPage(page, context) {
  const Component = componentRegistry[page.componentType] ?? componentRegistry.default;
  const props = parseProps(page.props);
  return <Component {...props} />;
}
```

Routing context

```ts
type Event = { type: string; payload?: any };
export const RoutingContext = React.createContext({
  currentPageId: null as string | null,
  advance: async (_event: Event) => {},
});
```

User store context

```ts
type UserStore = Record<string, any>;
export const UserStoreContext = React.createContext({
  state: {} as UserStore,
  assign: (_path: string, _value: any) => Promise.resolve(),
  bulkAssign: (_patch: Record<string, any>) => Promise.resolve(),
});
```


