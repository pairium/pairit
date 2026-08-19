# Pairit

Monorepo for a behavioral science experiment platform. Participants run experiments in the **lab**, experimenters manage them via the **manager**.

## Local Development

Prerequisites:
- `.env` file in project root (Google OAuth credentials + remote Atlas URI)

```bash
# Start dev (remote Atlas + Google OAuth + auth required)
# Open http://localhost:3000/<experimentId> to trigger sign-in
bun run dev
```

## Commands

```bash
bun install                     # Install dependencies
bun run dev                     # Run all services (lab-app:3000, lab-server:3001, manager-server:3002)
bun run build                   # Build all packages
bun run test                    # Run tests (bun test for packages, vitest for lab-app)
biome check                     # Lint and format
tsc --noEmit                    # Type check
bash scripts/deploy.sh          # Deploy to Google Cloud Run (requires gcloud auth)
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

## Global install

Use npm, not bun:

```bash
npm install -g pairit
```

Do not also `bun install -g pairit`. Two copies end up on PATH (`~/.local/bin` vs `~/.bun/bin`) and the old one can win. If that happens: `bun remove -g pairit`. Confirm with `which pairit` and `pairit --version`.

## Documentation

Docs are at https://pairium.github.io/pairit/ (GitHub Pages + MkDocs).

```bash
gh workflow run docs.yml          # Manually deploy docs
```

Auto-deploys on push to `docs/**`.

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
- `biome check` currently reports pre-existing lint/format errors unrelated to setup. Root `tsc --noEmit` needs a package tsconfig (there is no root `tsconfig.json`); type-check per package instead.
