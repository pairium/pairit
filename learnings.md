# AI Learnings
- Ensure runtime registry exports requested symbols before re-export to prevent Vite import errors.
- Root scripts must target `lab-functions` and `manager-functions` explicitly; a bare `--filter functions` matches no workspace packages and silently skips builds.
- Navigation guards may need action context (e.g., skip-validation flags) so back buttons can bypass required-field checks while forward buttons enforce them.
- Hono wildcard routes (`/media/*`) with `c.req.param('*')` don't work reliably with Firebase Functions adapter; use named parameters (`/media/:object`) for path segments instead.
- Runtime adapters now sit next to their UI components as `*.runtime.ts` files (see `lab/app/src/components/runtime.ts`); they call `defineRuntimeComponent()` to self-register and keep event logic colocated while the registry stays a thin lookup table.
- `defineRuntimeComponent()` generics must constrain props to `Record<string, unknown>` so registration matches the registry's renderer signature.
- UI component modules now live in PascalCase directories (e.g., `lab/app/src/components/ui/Button/Button.tsx`) to mirror React naming and avoid case collisions when the repo is cloned on case-insensitive filesystems.
- `Survey` accepts optional `initialValues`, merging them with generated defaults (strings for text/numeric, arrays for multi-select). Pre-fill paginated flows with sanitized values instead of reimplementing form schema mapping.
- `PagedSurvey` wraps multiple `Survey` instances, reusing registerNavigationGuard to drive Next/Finish buttons. Persist per-page answers via `onSubmitValues` and pass merged `initialValues` back in when revisiting pages; no need to touch the runtime normalizer.
- Frontend and backend both needed reliable local config access. The runtime already loaded JSON from lab/app/public/configs/, so the lab functions had to mirror that instead of depending on separate manager uploads or network fetches.
- Accurate paths matter. The first fallback pointed at app/public/configs, triggering ENOENT; switching to lab/app/public/configs resolved it. Always double-check relative pathing in monorepos.

## Event-Based Survey Submission: Key Implementation Insights

### Specific Fixes and Challenges
- **Backend Event Endpoint**: Added `/sessions/:id/events` to validate and store events in Firestore's `events` collection, auto-populating context like `pageId` from the session. Updated session persistence from in-memory Map to Firestore with `loadSession()` and `saveSession()`. Relaxed `advance` validation to accept any target in hybrid mode, as frontend handles rendering from local pages.
- **Frontend Integration**: Introduced `EventPayload` type and `submitEvent()` in `api.ts` for POSTing to the events endpoint. In `registry.tsx`, added `onSubmitValues` callback to the survey renderer to emit `"survey_submission"` events with form data. Passed `sessionId` through `RuntimeComponentContext` in `renderer.tsx` and `PageRenderer`.
- **Survey Submission Trigger**: Removed conditional registration of navigation guards based on required fields; always register to capture optional data on navigation via `runNavigationValidation` calling `form.handleSubmit()`, which invokes `onSubmitValues`.
- **Page Normalization**: In `normalizer.ts`, generate IDs for components (e.g., `{ type: 'survey', id: \`${pageId}_survey\` }`) to ensure traceability. Fixed creation of `survey` and `buttons` components from DSL `nodes`.
- **App Bootstrap**: Implemented hybrid mode in `App.tsx`: Load local config for UI but always call `startSession()` for remote `sessionId` and events. On `advance`, use local pages for rendering but update remote session state. Added mode logging (LOCAL/REMOTE) and error handling for fallback.

### Development Workflow Tips
- **Emulator Quirks**: Use `firebase emulators:start --only functions:lab,functions:manager,firestore` for shared state across codebases. Restart with `pkill -f firebase` to avoid SIGTERM issues and ensure data visibility. Build functions with `pnpm --filter lab-functions build` before reloading (tsup to `dist/`).
- **Config Testing**: For ID mismatches (hashed vs explicit), use CLI `--config-id survey-showcase` to match URL. Temporarily hardcode configs in `loadConfig()` to bypass upload/emulator sync problems; remove for prod.
- **Hybrid Testing**: Set `VITE_API_URL` in `.env.local` (e.g., emulator URL). Local configs in `public/configs/` enable offline UI dev; remote requires uploaded configs but enables events. Restarts needed after env changes.
- **Debugging Strategy**: Add emoji-prefixed console.logs in frontend (browser) and backend (terminal) to trace async flows (session creation → context → submit → API → storage). Include `sessionId` for cross-file tracking. Use `useMemo` for stable React context; props drilling for small apps. Remove logs post-fix to clean code.
- **Cross-Project Access**: Lab and manager functions share Firestore project (`pairit-lab`) but run independently; emulator must include both for uploads to be visible.

### Project Structure Insights
- **Monorepo Workflow**: pnpm workspaces separate lab (participants) and manager (tools). Use `--filter` for targeted builds/watch. Vite loads env at startup; TanStack Router for SPA navigation.
- **DSL to Runtime**: Raw configs use `nodes` array; normalizer (`coerceConfig`, `normalizePage`) converts to `pages` object with `ComponentInstance[]`. Surveys expect `definition` prop, buttons `buttons` array.
- **Firebase Integration**: Admin SDK bypasses rules for backend writes. Client fetches for API. Hybrid bridges local UI (fast iteration) and remote persistence (events/state).
- **Error Patterns**: 404s from ID mismatches/missing data; 400s from validation. Trace API with curl (backend) and console (frontend). Add error boundaries in React for prod.
- **UX/Extensibility**: Independent per-page submissions fit event architecture but risk duplicates (use latest timestamp). Ready for extensions like button `onClick` events or media plays. Add `session_complete` on outro.