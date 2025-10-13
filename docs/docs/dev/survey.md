# Survey Implementation

Refer to `Components → Survey` for authoring guidance. This page captures runtime considerations that apply when wiring surveys into the platform.

## Form runtime

- Use TanStack Form (or an adapter with the same API) to register inputs defined by survey items.
- Treat each answer type as a field factory that provides validation rules and serialization into `$.user_state` by survey item `id`.
- Model `multi_select` answers as checkbox groups that persist an ordered array of selected values.
- Keep field registration stable across page transitions so restoring prior answers does not trigger unnecessary revalidation.
- When a survey page exposes required items, the runtime registers a navigation guard for the page-level button actions. The guard calls `form.handleSubmit()`, mirrors the normal submit flow (touching required fields, running schema validation), and only resolves once `form.state.isSubmitSuccessful` flips to true. Until then, the button advance is aborted and the inline field errors stay visible. Buttons can opt out by setting `skip_validation: true` on the action in the config (useful for back/cancel routes that should not block navigation).

## Pagination

- Multiple survey pages map to separate form scopes. Transitioning between pages should persist state with `form.getValues()` before navigation.
- Allow single-page surveys by keeping all items on one page so pagination logic stays a no-op in that case.
- Support branching via the optional `next` key on survey items; the navigator interprets it and selects the next page id.

## Branching

- Accept both string and mapping forms for `next`. A string jumps unconditionally, while a mapping routes by answer value.
- When using mappings, normalize submitted values (e.g. IDs instead of display text) to avoid brittle string comparisons.
- Provide a fallback path (`default` or sequential order) for answers that do not match a mapping key.

## State caching

- Cache completed page data in memory (or session storage) to enable back-navigation without losing answers.
- When rehydrating cached data, prefer TanStack Form's `reset` API so validation state matches the restored values.
- Delay cross-page validation until submission; enforce per-page validation before advancing to the next page.


