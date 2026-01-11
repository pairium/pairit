# Architecture

High-level components
- Runtime: UI renderer, routing, and state layer over React.
- CLI: lint/compile/upload configs to Manager Server.
- Lab: 
  - Frontend: React/Vite (served by Lab Server)
  - Backend: Elysia on Bun (Lab Server)
- Manager:
  - CLI: Admin tools
  - Backend: Elysia on Bun (Manager Server)
- Realtime: Server-Sent Events (SSE) for chat/session updates.
- Storage: MongoDB (configs, sessions, events, users).
- Media: Local/GCS Abstraction.


