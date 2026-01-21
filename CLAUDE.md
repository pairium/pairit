# Pairit

Monorepo for a behavioral science experiment platform. Participants run experiments in the **lab**, experimenters manage them via the **manager**.

## Commands

```bash
bun install                     # Install dependencies
bun run dev                     # Run all services (lab-app:3000, lab-server:3001, manager-server:3002)
bun run build                   # Build all packages
bun test                        # Run tests
biome check                     # Lint and format
tsc --noEmit                    # Type check
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
  storage/       # Storage abstraction (Local/GCS)
  html/          # HTML utilities
```

## Tech Stack

- **Runtime**: Bun
- **Frontend**: React 19, Vite 7, TailwindCSS 4, TanStack Router
- **Backend**: Elysia, MongoDB
- **Auth**: Better Auth with Google OAuth

## Conventions

- Package names: `@pairit/{name}`
- Workspace deps: `workspace:*`
- TypeScript strict mode
- Biome for linting/formatting
