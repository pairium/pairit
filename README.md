# Pairit Quickstart

This monorepo hosts the Pairit stack.

## Repository Structure

- `docs/`
- `lab/`: Participant-facing app
  - `app/`: Vite + React frontend
  - `functions/`: Hono backend on Firebase Functions
- `manager/`: Experimenter-facing tools
  - `cli/`: CLI for managing experiments
  - `functions/`: Hono backend on Firebase Functions

## Prerequisites

- Node.js 22 or newer
- pnpm 8 or newer
- Firebase CLI: `npm i -g firebase-tools`

## Quickstart

### Experimenters

1. Review the experimenter docs in `docs/` or at [pairit-lab-docs.web.app](https://pairit-lab-docs.web.app), starting with `docs/quickstart.md` for a YAML template.
2. Use the CLI to validate or publish your config once the CLI is installed (see `manager/cli/README.md`):

   ```zsh
   pairit config lint your_experiment.yaml
   pairit config compile your_experiment.yaml
   pairit config upload your_experiment.yaml --owner you@example.com
   ```

3. Share the published experiment link with participants.

### Developers

1. Install dependencies: `pnpm install`
2. Build packages: `pnpm build`
3. Start local services:

   - Terminal 1: `pnpm emulators`
   - Terminal 2: `pnpm --filter lab-app dev`

   Visit http://localhost:3000. The emulators run functions at http://127.0.0.1:5001/pairit-lab/us-east4/lab and Firestore at http://localhost:8080 (UI at http://localhost:4000).

## Firebase Setup and Deployment

This project uses a single Firebase project for Firestore rules, Cloud Functions (two codebases: `lab` for participant API and `manager` for experimenter API), and Hosting (two sites: `lab-app` for the web app and `docs` for documentation). See `firebase.json` for configuration details.

### Local Emulators

The `pnpm emulators` script builds the functions and starts the emulators for functions, Firestore, and Realtime Database.

If you want to run just `lab-functions`: `firebase emulators:start --only functions:lab,firestore`.

If you want to run just `manager-functions`: `firebase emulators:start --only functions:manager,firestore`.

To point the CLI to the emulator: `export PAIRIT_FUNCTIONS_BASE_URL=http://127.0.0.1:5001/pairit-lab/us-east4/lab`. (This is hard-coded now.)

### Deploying to Production

1. Authenticate and select project:

   `firebase login`

   `firebase use <your-project-id>`

   (Replace `<your-project-id>` with your Firebase project, e.g., `pairit-lab`. Create it in the Firebase console if needed.)

2. Deploy Cloud Functions:

   Build: `pnpm --filter lab-functions build && pnpm --filter manager-functions build`

   Deploy both: `firebase deploy --only functions`

   Or deploy specific: `firebase deploy --only functions:lab` or `functions:manager`

   The API base URL will be `https://<region>-<your-project-id>.cloudfunctions.net/api` (default region: us-central1; check your function configuration).

   Update configurations:

   - CLI: `export PAIRIT_FUNCTIONS_BASE_URL=<deployed-api-url>`
   - Web app: In `lab/app/.env.production`, set `VITE_API_URL=<deployed-api-url>`

3. Deploy the lab web app (static hosting):

   `pnpm --filter lab-app build`

   (First time: `firebase hosting:sites:create lab-app`)

   `firebase deploy --only hosting:lab-app`

4. Deploy documentation:

   ```zsh
   cd docs
   uv sync
   mkdocs build
   cd ..
   ```

   (First time: `firebase hosting:sites:create docs`)

   `firebase deploy --only hosting:docs`

## Todo

get pairit complete with surveys first
- [x] visual feedback for buttons
- [x] fix survey required items
- [x] add back button
- [x] media in Cloud Storage, keep metadata in Firestore
- [x] firestore events
  - [x] survey
  - [x] other components too
- [-] refactor runtime
  > strip redundant logic from the normalizer. i want to keep the runtime minimal. when we add new properties and components, can we just add it to the component and the config? i don't want the runtime to care about the specific components, just some abstractions of the components. and capture a note in the docs that future additions should live in components plus config when possible.
  - [x] registry
  - [ ] normalizer - need to think about where to put the defensive logic
  - [x] regression test
- [x] add paginated survey component
- [x] sessions
  - [x] store data
- [x] update landing page with example configs
- [ ] lab app auth?
  - [ ] user id
- [ ] cli auth
- [ ] make app & docs look nice like [shadcn](https://ui.shadcn.com/)
   - [ ] consolidate styles

### Backlog

- [ ] developer preview
- [ ] agents
- [ ] chat
- [ ] live workspace
