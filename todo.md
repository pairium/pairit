# Pairit TODO

This file is the canonical project TODO. (The root `README.md` links here to avoid duplicating the list in multiple places.)

## Current

- [x] visual feedback for buttons
- [x] fix survey required items
- [x] add back button
- [x] media in Cloud Storage, keep metadata in MongoDB (migrated from Firestore)
- [x] firestore events (migrated to MongoDB)
  - [x] survey
  - [x] other components too
- [x] refactor runtime
  - [x] registry
  - [x] normalizer
  - [x] regression test
- [x] add paginated survey component
- [x] sessions
  - [x] store data (MongoDB)
- [x] update landing page with example configs
- [x] lab app auth (Better Auth)
- [x] cli auth (Better Auth)
- [ ] make app & docs look nice like [shadcn](https://ui.shadcn.com/)
  - [ ] consolidate styles

## Backlog/Completed Modernization

- [x] unify lab app (Bun + Hono serving both API and frontend) -> Implemented with Elysia + Static Plugin
- [x] remove Firebase Functions dependency -> Migrated to Dockerized Elysia servers
- [x] single Docker deployment -> `docker-compose.yml` created

