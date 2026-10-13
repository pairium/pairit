# Pairit

Monorepo for a behavioral science experiment platform. Participants run experiments in the **lab**, experimenters manage them via the **manager**.

## Local Development

Test changes locally before deploying to staging.

Setup, once:
- `cp env.template .env`. It points at a local MongoDB and at `localhost` for the CLI.
- In `.env`, set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from `.env.staging`. That OAuth client allows `http://localhost:3000` (lab) and `http://localhost:3002` (manager).
- In `.env`, set `MANAGER_BOOTSTRAP_ADMIN_EMAIL` to your email so the local manager lets you upload.
- Start MongoDB: `mkdir -p ~/.pairit-mongo && mongod --dbpath ~/.pairit-mongo`. Keep it running while you use `bun run dev`.

```bash
bun run dev                                                       # lab-app:3000, lab-server:3001, manager-server:3002
bun run apps/manager/cli/src/index.ts login                       # local manager; .env sets PAIRIT_API_URL
bun run apps/manager/cli/src/index.ts config upload configs/split-demo.yaml --config-id split-demo --openai-api-key <key>
```

Then open `http://localhost:3000/split-demo` and sign in with Google. Use the lab on port 3000; port 3001 serves the last `bun run build`.

To skip sign-in, or to act as several participants at once (e.g. matchmaking or a shared chat), open the experiment as Prolific participants. Each `PROLIFIC_PID` is a separate participant:

```
http://localhost:3000/split-demo?PROLIFIC_PID=a&STUDY_ID=s&SESSION_ID=1
http://localhost:3000/split-demo?PROLIFIC_PID=b&STUDY_ID=s&SESSION_ID=2
```

The CLI uses `PAIRIT_API_URL` from `.env` unless you pass `--env staging` or `--env production`, which always win.

## Commands

```bash
bun install                     # Install dependencies
bun run dev                     # Run all services (lab-app:3000, lab-server:3001, manager-server:3002)
bun run build                   # Build all packages
bun run test                    # Run tests (bun test for packages, vitest for lab-app)
biome check                     # Lint and format
tsc --noEmit                    # Type check
bash scripts/deploy.sh staging      # Deploy staging (loads .env.staging)
bash scripts/deploy.sh production   # Deploy production (loads .env.production)
bash scripts/test.sh staging        # Health + integration tests against staging
bash scripts/test.sh production     # Health + integration tests against production
```

Filter by package: `bun run --filter lab-app dev`

## Structure

```
apps/
  lab/app/       # React frontend (Vite, TailwindCSS)
  lab/server/    # API server (Elysia, Bun)
  manager/cli/   # CLI for experiment config
  manager/server/# Manager API
packages/
  auth/          # Better Auth + Google OAuth
  db/            # MongoDB connection singleton
```

## Tech Stack

- **Runtime**: Bun
- **Frontend**: React 19, Vite 7, TailwindCSS 4, TanStack Router
- **Backend**: Elysia, MongoDB
- **Auth**: Better Auth with Google OAuth

## Manager allowlist

Add experimenters with the published CLI. You must be logged in as an admin (`pairit login`). The seeded admin is `harang@pairium.ai` (`MANAGER_BOOTSTRAP_ADMIN_EMAIL`). A Gmail login can be on the allowlist as a researcher and still get 403 on admin commands.

```bash
pairit admin add-user person@example.com            # researcher
pairit admin add-user person@example.com --admin    # can manage the allowlist
pairit admin list-users
```

`error: unknown command 'admin'` means the global CLI is stale. Source in `apps/manager/cli` can be ahead of npm.

## Publish the CLI

The CLI package is `apps/manager/cli`, published as `pairit` on npm (owner: `harangju`). Bump `version` in `package.json` and `program.version()` in `src/index.ts`.

```bash
cd apps/manager/cli
npm login          # must be harangju
npm publish        # runs the build via prepublishOnly
npm install -g pairit
```

A 404 from `npm publish` is npm hiding an auth error. Check `npm whoami` — it should print `harangju`. Use `--otp` if 2FA is on.

### Release notes

Every published version gets a GitHub Release and a changelog entry.

1. Tag the commit npm published from. `npm view pairit@X.Y.Z gitHead` prints it. Don't assume it is `main`.
2. Create the release. The notes are for researchers: an upgrade command, what's new, and any change they must make (e.g. a renamed flag).
   ```bash
   gh release create cli-vX.Y.Z --target <gitHead> --title "Pairit CLI X.Y.Z" --notes-file notes.md
   ```
3. Add a `## CLI X.Y.Z` section at the top of `docs/docs/changelog.md`. It holds a short summary and a link to the release.
4. To announce it, draft a plain-text email (Gmail has no code blocks) that links the release. Get recipients from `pairit admin list-users`. Leave out the admins and BCC everyone. The user sends it.

## Global install

Use npm, not bun:

```bash
npm install -g pairit
```

Do not also `bun install -g pairit`. Two copies end up on PATH (`~/.local/bin` vs `~/.bun/bin`) and the old one can win. If that happens: `bun remove -g pairit`. Confirm with `which pairit` and `pairit --version`.

## Documentation

Docs are at https://docs.pairium.ai/pairit/ (GitHub Pages + MkDocs).

```bash
gh workflow run docs.yml          # Manually deploy docs
```

Auto-deploys on push to `docs/**`.

## Deploy

Two cloud environments. Local dev still uses `.env`. The deploy script never sources `.env`. Details are in `docs/docs/dev/deployment.md`.

| | Staging | Production |
|---|---|---|
| Command | `bash scripts/deploy.sh staging` | `bash scripts/deploy.sh production` |
| Env file | `.env.staging` | `.env.production` |
| Google project | `pairit-lab-staging` | `pairit-lab` |
| Database | `pairit-staging` | `pairit` |
| Media bucket | `pairit-lab-media-staging` | `pairit-lab-media` |
| Lab | https://pairit-staging.pairium.ai | https://pairit.pairium.ai |
| Manager | https://pairit-api-staging.pairium.ai | https://pairit-api.pairium.ai |

- Staging and production must use different `PROJECT_ID` values, OAuth clients, and buckets. The script stops if the two env files share a project, a database, or a media bucket.
- A staging deploy refuses a database whose name does not contain `staging`. A production deploy refuses a database whose name contains `staging`.
- `bash scripts/test.sh staging` and `bash scripts/test.sh production` test the public URLs. The integration step reuses your CLI login for that environment. Log in first with `bun run apps/manager/cli/src/index.ts --env staging login` (or `--env production`).
- Deploy staging before production.
- CI (`.github/workflows/ci.yml`) runs Biome, type check, tests, and build on every PR. `deploy.yml` deploys staging on push to `main` and production by hand from the Actions tab. Setup: "Deploying from GitHub Actions" in `docs/docs/dev/deployment.md`.
- The published `pairit` CLI talks to production. Add `--env staging` to use staging (e.g. `pairit --env staging login`). Each environment keeps its own saved login.

## Conventions

- Package names: `@pairit/{name}`
- Workspace deps: `workspace:*`
- TypeScript strict mode
- Biome for linting/formatting

## Cursor Cloud specific instructions

Bun and MongoDB are preinstalled in the environment (`bun` is on `PATH`); the startup update script only runs `bun install`.

- MongoDB is not auto-started. Start it before running the servers or DB-touching tests: `mongod --dbpath /data/db --bind_ip 127.0.0.1` (run it in the background, e.g. a tmux session).
- Local dev needs a `.env` (gitignored). If missing, `cp env.template .env` — its defaults (local Mongo + dummy Google OAuth) work as-is.
- Run everything with `bun run dev` (lab-app:3000, lab-server:3001, manager-server:3002). Standard commands are in the `## Commands` section above.
- Email/password auth is disabled — only Google OAuth. With dummy OAuth you cannot complete a real sign-in locally. To exercise a full experiment without Google login, load the lab as a Prolific participant: `http://localhost:3000/<configId>?PROLIFIC_PID=x&STUDY_ID=y&SESSION_ID=z` (these params bypass the `FORCE_AUTH=true` OAuth check). The `<configId>` must already exist in the Mongo `configs` collection; seed one by compiling a config (`bun run apps/manager/cli/src/index.ts config compile configs/hello-world.yaml`) and inserting the JSON with `configId` + `requireAuth: false`.
- Run the CLI from source with `bun run apps/manager/cli/src/index.ts <command>` (the globally published `pairit` may be stale). `config lint`/`config compile` are fully local; `upload`/`admin`/`data` need auth + the manager server.
- CI runs `biome ci`, so keep `biome check` clean. Root `tsc --noEmit` needs a package tsconfig (there is no root `tsconfig.json`); type-check per package instead.
