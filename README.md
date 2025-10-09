# Pairit Quickstart

This repo hosts a minimal end-to-end slice of the Pairit stack: a pnpm monorepo with a Vite/React client, Firebase Functions powered by Hono, and supporting packages for the configuration DSL and runtime.

## Prerequisites

- Node.js 20 (Functions deploy target) or newer
- pnpm 8+
- Firebase CLI (`npm i -g firebase-tools`) if you want to run emulators

## 1. Install dependencies

```zsh
pnpm install
```

## 2. Build the workspaces

```zsh
pnpm build
```

This compiles all packages and ensures TS typings are in sync.

## 3. Compile the sample config

```zsh
pnpm publish:example
```

The command reads `configs/simple-survey.yaml` and writes the normalized JSON to `configs/simple-survey.json`. The generated config is what the backend currently uses to drive the hard-coded flow.

## 4. Start local services

Open three terminals.

Terminal A – Firebase emulators (Functions + Firestore + RTDB):

```zsh
pnpm emulators
```

Terminal B – Functions type build (optional while developing):

```zsh
pnpm --filter functions dev
```

This keeps `apps/functions/dist` up-to-date while emulators are running.

Terminal C – Web client:

```zsh
pnpm --filter web dev
```

Visit `http://localhost:5173`.

## 5. Manual walkthrough

1. On the web client, click **Start session**.
2. The UI calls `POST /sessions/start` on the local Function and shows the returned `sessionId` and current node (`intro`).
3. Click **Next** to advance; the backend transitions to `survey_1`, then `outro`.
4. After reaching `outro`, the UI displays the thank-you state.

Behind the scenes, session documents are created under the Firestore emulator at `sessions/{sessionId}`.

## 6. API spot checks (optional)

With the emulators running, you can hit the API directly:

Start a session:

```zsh
curl -X POST \
  http://localhost:5001/pairit-local/us-central1/api/sessions/start \
  -H 'Content-Type: application/json' \
  -d '{"publicId":"demo"}'
```

Advance the session (replace `SESSION_ID`):

```zsh
curl -X POST \
  http://localhost:5001/pairit-local/us-central1/api/sessions/SESSION_ID/advance \
  -H 'Content-Type: application/json' \
  -d '{"event":{"type":"next"}}'
```

Fetch session state:

```zsh
curl http://localhost:5001/pairit-local/us-central1/api/sessions/SESSION_ID
```

## 7. Tests

```zsh
pnpm test
```

Currently this runs the compiler unit test and verifies other packages have no tests (pass quickly).

## Notes

- The API is intentionally minimal: it stores sessions in Firestore and advances through the baked-in intro → survey → outro flow.
- Updating the flow requires editing `apps/functions/src/index.ts` until config loading is wired up.
- When you change Functions code, rerun `pnpm --filter functions dev` (or rebuild once) so the emulator sees new output.
