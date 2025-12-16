# Modernization Roadmap: Pairit Stack Migration
This is a complete modernization roadmap. We don't care about backward compatibility or migration. We just want to remove all the deprecated dependencies and migrate to the latest stack.

## Phase Dependency Analysis

```
Phase 1: Infrastructure (Docker, MongoDB, Bun setup)
    ↓
Phase 2: Backend (Elysia servers, MongoDB integration, storage abstraction)
    ↓
Phase 3: Auth (Better Auth - requires working backend)
    ↓
Phase 4: Frontend (Remove Firebase deps, combine into SSR - requires working backend)
    ↓
Phase 5: CLI (Update to new auth/API - requires auth + backend)
```

**Constraint Check:**
- ✅ Auth needs backend routes to mount on → Phase 3 after Phase 2
- ✅ CLI needs auth endpoints → Phase 5 after Phase 3
- ✅ Frontend needs working API → Phase 4 after Phase 2 (can parallelize with Phase 3)
- ✅ Storage abstraction needed before Phase 2 completes → Include in Phase 1 or early Phase 2

---

## Phase 1: Infrastructure Foundation ✅

**Status:** COMPLETED (December 2024)

**Branch:** `modernization/phase-1-infrastructure`

### Tasks

| Task | Cleanup |
|------|---------|
| Initialize Bun workspace at root | Remove `pnpm-workspace.yaml`, `pnpm-lock.yaml` |
| Create `docker-compose.yml` (MongoDB, app services) | Remove Firebase emulator config from `firebase.json` |
| Create `Dockerfile.lab` for lab server | — |
| Create `Dockerfile.manager` for manager server | — |
| Create storage abstraction module (`lib/storage/`) | — |
| Update root `package.json` scripts for Bun | Remove `packageManager: pnpm` |
| Add `.dockerignore` | — |

### File Changes

**New Files:**
- `docker-compose.yml`
- `Dockerfile.lab`
- `Dockerfile.manager`
- `lib/storage/index.ts` (abstraction layer)
- `lib/storage/local.ts` (filesystem backend)
- `lib/storage/gcs.ts` (GCS backend)
- `.dockerignore`
- `bun.lock` (auto-generated)

**Delete:**
- `pnpm-workspace.yaml`
- `pnpm-lock.yaml`

**Modify:**
- `package.json` (switch to Bun, update scripts)
- `.gitignore` (add `bun.lock`, remove pnpm references)

### Testing Strategy

```bash
# 1. Verify Bun works
bun --version
bun install

# 2. Verify Docker Compose starts MongoDB
docker compose up -d mongodb
docker compose exec mongodb mongosh --eval "db.runCommand({ ping: 1 })"

# 3. Verify storage abstraction (unit tests)
bun test lib/storage/
```

**Exit Criteria:**
- [x] `bun install` completes without error
- [x] `docker compose up mongodb` starts successfully
- [x] Storage abstraction tests pass for both local and GCS backends (mocked)

**Completion Notes:**
- Migrated from pnpm to Bun workspaces
- Created Docker Compose configuration with MongoDB 8
- Implemented storage abstraction with LocalStorage and GCSStorage backends
- All services configured with health checks and dependencies

---

## Phase 2: Backend Migration (Lab + Manager Servers) ✅

**Status:** COMPLETED (December 2024)

**Branch:** `modernization/phase-2-backend`

### Tasks

| Task | Cleanup |
|------|---------|
| Rewrite lab server with Elysia + MongoDB | Delete `lab/functions/` |
| Rewrite manager server with Elysia + MongoDB | Delete `manager/functions/` |
| Integrate storage abstraction for media | — |
| Update `package.json` scripts in each server | Remove `tsup` deps, `firebase-*` deps |
| Add server Dockerfiles | — |

### New Structure

```
lab/
  server/
    src/
      index.ts          # Elysia app entry
      routes/
        sessions.ts     # /sessions/* endpoints
        configs.ts      # /configs/* endpoints  
        events.ts       # /sessions/:id/events
      lib/
        db.ts           # MongoDB connection
    package.json
    Dockerfile

manager/
  server/
    src/
      index.ts          # Elysia app entry
      routes/
        configs.ts      # Config CRUD
        media.ts        # Media upload/list/delete
      lib/
        db.ts           # MongoDB connection
    package.json
    Dockerfile
```

### Key Code Changes

**Lab Server Entry (`lab/server/src/index.ts`):**
```typescript
import { Elysia } from "elysia";
import { sessionsRoutes } from "./routes/sessions";
import { configsRoutes } from "./routes/configs";
import { eventsRoutes } from "./routes/events";

const app = new Elysia()
  .use(sessionsRoutes)
  .use(configsRoutes)
  .use(eventsRoutes)
  .listen(Number(process.env.PORT) || 3001);

console.log(`Lab server running on ${app.server?.hostname}:${app.server?.port}`);
```

**Manager Server Entry (`manager/server/src/index.ts`):**
```typescript
import { Elysia } from "elysia";
import { configsRoutes } from "./routes/configs";
import { mediaRoutes } from "./routes/media";

const app = new Elysia()
  .use(configsRoutes)
  .use(mediaRoutes)
  .listen(Number(process.env.PORT) || 3002);

console.log(`Manager server running on ${app.server?.hostname}:${app.server?.port}`);
```

### Docker Compose Update

```yaml
services:
  mongodb:
    image: mongo:7
    ports:
      - "27017:27017"
    volumes:
      - mongodb_data:/data/db

  lab-server:
    build:
      context: .
      dockerfile: lab/server/Dockerfile
    ports:
      - "3001:3001"
    environment:
      - MONGODB_URI=mongodb://mongodb:27017/pairit
      - STORAGE_BACKEND=local
      - STORAGE_PATH=/app/storage
    depends_on:
      - mongodb
    volumes:
      - ./storage:/app/storage

  manager-server:
    build:
      context: .
      dockerfile: manager/server/Dockerfile
    ports:
      - "3002:3002"
    environment:
      - MONGODB_URI=mongodb://mongodb:27017/pairit
      - STORAGE_BACKEND=local
      - STORAGE_PATH=/app/storage
    depends_on:
      - mongodb
    volumes:
      - ./storage:/app/storage

volumes:
  mongodb_data:
```

### Testing Strategy

```bash
# 1. Start services
docker compose up -d

# 2. Test lab server health
curl http://localhost:3001/

# 3. Test session creation (manual - no auth yet)
curl -X POST http://localhost:3001/sessions/start \
  -H "Content-Type: application/json" \
  -d '{"configId": "test"}'

# 4. Test manager config upload
curl -X POST http://localhost:3002/configs/upload \
  -H "Content-Type: application/json" \
  -d '{"configId": "test", "owner": "test@example.com", "checksum": "abc", "config": {}}'

# 5. Run integration tests
bun test lab/server/
bun test manager/server/
```

**Exit Criteria:**
- [x] Lab server starts and responds to health check
- [x] Manager server starts and responds to health check
- [x] Session CRUD operations work with MongoDB
- [x] Config CRUD operations work with MongoDB
- [x] Media upload works with local filesystem
- [x] All existing API contracts maintained (response shapes unchanged)

**Completion Notes:**
- Implemented lab server with Elysia framework (3001)
  - Routes: `/sessions/start`, `/sessions/:id`, `/sessions/:id/advance`, `/sessions/:id/events`, `/configs/:configId`
  - MongoDB collections: `sessions`, `events`, `configs`
- Implemented manager server with Elysia framework (3002)
  - Routes: `/configs/upload`, `/configs`, `/configs/:configId`, `/media/upload`, `/media`, `/media/:object`
  - Integrated storage abstraction for media handling
- Added Elysia TypeBox schema validation to all endpoints (automatic request validation)
  - 100% coverage: All 11 routes (5 lab + 6 manager) have complete schema validation
  - Schemas defined for all params, bodies, and queries
- Created multi-stage Dockerfiles for both servers
- Updated docker-compose.yml with lab-server and manager-server services
- All services running successfully with health checks

### Files to Delete After Phase 2

- `lab/functions/` (entire directory)
- `manager/functions/` (entire directory)
- `firebase.json` (no longer needed)
- `.firebaserc`
- `firestore.rules`
- `database.rules.json`

---

## Phase 3: Authentication (Better Auth) ✅

**Status:** COMPLETED (December 2024)

**Branch:** `modernization/phase-3-auth`

### Tasks

| Task | Cleanup |
|------|---------|
| Add Better Auth to lab server | — |
| Add Better Auth to manager server | — |
| Configure Google OAuth provider | — |
| Add auth middleware to protected routes | — |
| Add optional auth for lab user sessions | — |
| Add `requireAuth` flag to config schema | — |
| Generate unique session links (session tokens) | — |
| Create user sessions collection in MongoDB | — |

### Authentication Modes

**Manager Routes:** Always require authentication (OAuth)
**Lab User Routes:** 
- **With `requireAuth: true`** (default): Users must sign in with Google OAuth
- **With `requireAuth: false`**: Users access sessions via unique session link without login

### Code Structure

**Shared Auth Config (`lib/auth/index.ts`):**
```typescript
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";

export const auth = betterAuth({
  database: mongodbAdapter(client),
  emailAndPassword: { enabled: false },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
});
```

**Mount in Elysia (`lab/server/src/index.ts`):**
```typescript
import { auth } from "../../../lib/auth";

const app = new Elysia()
  .onRequest(({ request }) => {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/auth")) {
      return auth.handler(request);
    }
  })
  // ... rest of routes
```

**Optional Auth Middleware (`lab/server/src/lib/auth-middleware.ts`):**
```typescript
import { db } from "./db";
import { auth } from "../../../../lib/auth";

export async function optionalAuthMiddleware({ 
  request, 
  params 
}: { 
  request: Request; 
  params: { id?: string } 
}) {
  const configId = params.id; // from route params or body
  if (!configId) return { requireAuth: true, user: null };

  // Check config settings
  const config = await db.collection("configs").findOne({ configId });
  const requireAuth = config?.requireAuth ?? true;

  if (!requireAuth) {
    // Check for valid session token in URL param or query
    const url = new URL(request.url);
    const sessionToken = url.searchParams.get("token");
    
    if (sessionToken) {
      const session = await db.collection("sessions").findOne({ 
        sessionToken,
        configId 
      });
      
      if (session) {
        return { requireAuth: false, sessionId: session._id, user: null };
      }
    }
  }

  // Fallback to regular auth
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    throw new Error("Unauthorized");
  }
  
  return { requireAuth: true, user: session.user };
}
```

**Session Creation with Token (`lab/server/src/routes/sessions.ts`):**
```typescript
import { randomBytes } from "crypto";

app.post("/sessions/start", async ({ body, request }) => {
  const { configId } = body;
  const config = await db.collection("configs").findOne({ configId });
  const requireAuth = config?.requireAuth ?? true;

  let user = null;
  if (requireAuth) {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      throw new Error("Unauthorized");
    }
    user = session.user;
  }

  // Generate unique session token for shareable link
  const sessionToken = randomBytes(32).toString("hex");
  
  const newSession = {
    configId,
    userId: user?.id ?? null,
    sessionToken,
    createdAt: new Date(),
    // ... other session data
  };

  const result = await db.collection("sessions").insertOne(newSession);
  
  // Return session with unique link
  return {
    sessionId: result.insertedId,
    sessionToken,
    shareableLink: requireAuth 
      ? null 
      : `${process.env.PUBLIC_URL}/${configId}?token=${sessionToken}`
  };
});
```

**Config Schema Update (`manager/server/src/routes/configs.ts`):**
```typescript
const ConfigSchema = Type.Object({
  configId: Type.String(),
  owner: Type.String(),
  requireAuth: Type.Optional(Type.Boolean()), // Add this field
  // ... other config fields
});
```

### Testing Strategy

```bash
# 1. Verify auth endpoints exist
curl http://localhost:3001/api/auth/providers

# 2. Test OAuth flow (manual - browser)
# Navigate to http://localhost:3001/api/auth/signin/google

# 3. Test protected endpoint without auth (should 401)
curl -X POST http://localhost:3002/configs/upload \
  -H "Content-Type: application/json" \
  -d '{"configId": "test", ...}'
# Expected: 401 Unauthorized

# 4. Test with session cookie (after login)
curl -X POST http://localhost:3002/configs/upload \
  -H "Cookie: better-auth.session=..." \
  -H "Content-Type: application/json" \
  -d '{"configId": "test", ...}'

# 5. Test config upload with requireAuth flag
curl -X POST http://localhost:3002/configs/upload \
  -H "Cookie: better-auth.session=..." \
  -H "Content-Type: application/json" \
  -d '{"configId": "test", "requireAuth": false, "owner": "test@example.com", ...}'

# 6. Test session creation with requireAuth: false
curl -X POST http://localhost:3001/sessions/start \
  -H "Content-Type: application/json" \
  -d '{"configId": "test"}'
# Expected: Returns sessionId, sessionToken, and shareableLink

# 7. Test access via unique link (no auth required)
# Use the shareableLink from step 6
curl "http://localhost:3001/sessions/{sessionId}?token={sessionToken}"
# Expected: Success without authentication

# 8. Test access without token when requireAuth: false (should fail)
curl "http://localhost:3001/sessions/{sessionId}"
# Expected: 401 Unauthorized

# 9. Test session creation with requireAuth: true (default)
curl -X POST http://localhost:3002/configs/upload \
  -H "Cookie: better-auth.session=..." \
  -H "Content-Type: application/json" \
  -d '{"configId": "test-auth", "owner": "test@example.com", ...}'

curl -X POST http://localhost:3001/sessions/start \
  -H "Content-Type: application/json" \
  -d '{"configId": "test-auth"}'
# Expected: 401 Unauthorized (no auth header)

curl -X POST http://localhost:3001/sessions/start \
  -H "Cookie: better-auth.session=..." \
  -H "Content-Type: application/json" \
  -d '{"configId": "test-auth"}'
# Expected: Success with authenticated user
```

**Exit Criteria:**
- [x] `/api/auth/*` routes respond
- [x] Google OAuth flow completes (manual test)
- [x] Protected routes reject unauthenticated requests
- [x] Protected routes accept authenticated requests
- [x] User records created in MongoDB
- [x] Config schema accepts `requireAuth` boolean field
- [x] Session creation generates unique token when `requireAuth: false`
- [x] Lab users can access sessions via unique link without login when auth is disabled
- [x] Lab users cannot access sessions without token or auth when `requireAuth: true`
- [x] Manager routes always require authentication regardless of config setting

**Completion Notes:**
- Integrated Better Auth with MongoDB adapter in `lib/auth`
- Implemented "Strict" `authMiddleware` for Manager Server (enforced on all routes)
- Implemented "Hybrid" `optionalAuthMiddleware` for Lab Server (supports both authenticated users and anonymous token access)
- Refactored all routes to use centralized middleware pattern
- Verified flows with `test-auth.sh`, including anonymous session creation via POST body inspection

---

## Phase 4: Frontend Migration

**Branch:** `modernization/phase-4-frontend`

### Tasks

| Task | Cleanup |
|------|---------|
| Switch frontend to Bun | Remove Vite from devDeps (optional - can keep for dev) |
| Update `VITE_API_URL` handling | — |
| Add auth client (Better Auth) | — |
| Create SSR setup with Elysia static serving | — |
| Combine lab server + frontend into single app | — |

### New Structure

```
lab/
  server/
    src/
      index.ts          # Elysia app with static serving
      routes/...
    public/             # Built frontend assets
  app/
    src/...             # React source (unchanged)
    package.json
```

### Updated Lab Server (`lab/server/src/index.ts`)

```typescript
import { Elysia } from "elysia";
import { staticPlugin } from "@elysiajs/static";
import { auth } from "../../../lib/auth";
import { sessionsRoutes } from "./routes/sessions";
import { configsRoutes } from "./routes/configs";
import { eventsRoutes } from "./routes/events";

const distPath = "../app/dist";

const app = new Elysia()
  .onRequest(({ request }) => {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/auth")) {
      return auth.handler(request);
    }
  })
  .use(sessionsRoutes)
  .use(configsRoutes)
  .use(eventsRoutes)
  .use(staticPlugin({ assets: distPath, prefix: "/" }))
  // SPA fallback routes
  .get("/", () => Bun.file(`${distPath}/index.html`))
  .get("/:experimentId", () => Bun.file(`${distPath}/index.html`))
  .listen(Number(process.env.PORT) || 3001);
```

### Frontend API Client Update (`lab/app/src/lib/api.ts`)

```typescript
// Use relative URLs since frontend is served from same origin
const baseUrl = import.meta.env.VITE_API_URL || "";

// ... rest unchanged
```

### Testing Strategy

```bash
# 1. Build frontend
cd lab/app && bun run build

# 2. Start combined server
cd lab/server && bun run dev

# 3. Verify frontend loads
curl http://localhost:3001/ | grep -q "<div id=\"root\">"

# 4. Verify API still works
curl http://localhost:3001/sessions/start \
  -H "Content-Type: application/json" \
  -d '{"configId": "test"}'

# 5. E2E test (if you have Playwright/Cypress)
bun run test:e2e
```

**Exit Criteria:**
- [ ] Frontend builds with Bun
- [ ] Combined server serves both API and static assets
- [ ] SPA routing works (direct URL access to `/:experimentId`)
- [ ] Session flow works end-to-end in browser
- [ ] Auth flow works in browser

---

## Phase 5: CLI Migration

**Branch:** `modernization/phase-5-cli`

### Tasks

| Task | Cleanup |
|------|---------|
| Switch CLI to Bun | Remove `tsup`, `node-fetch` deps |
| Add Better Auth client for login | — |
| Update API client for authenticated requests | — |
| Update `package.json` scripts | — |

### CLI Auth Flow

```typescript
// manager/cli/src/auth.ts
import { createAuthClient } from "better-auth/client";

const authClient = createAuthClient({
  baseURL: process.env.PAIRIT_API_URL || "http://localhost:3002",
});

export async function login() {
  // Device flow for CLI
  const { url, userCode, deviceCode } = await authClient.signIn.device();
  console.log(`Visit ${url} and enter code: ${userCode}`);
  
  // Poll for completion
  const session = await authClient.waitForDeviceAuth(deviceCode);
  // Store session token locally
  await saveToken(session.token);
}
```

### Package.json Update

```json
{
  "name": "pairit-cli",
  "type": "module",
  "bin": { "pairit": "src/index.ts" },
  "scripts": {
    "dev": "bun --watch src/index.ts",
    "build": "bun build src/index.ts --outdir dist --target node",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "commander": "^12.1.0",
    "better-auth": "^1.0.0",
    "yaml": "^2.6.0"
  }
}
```

### Testing Strategy

```bash
# 1. Test login flow
bun run src/index.ts login

# 2. Test config operations
bun run src/index.ts config lint test.yaml
bun run src/index.ts config upload test.yaml --owner test@example.com

# 3. Test media operations
bun run src/index.ts media upload image.png
bun run src/index.ts media list
```

**Exit Criteria:**
- [ ] CLI runs with Bun directly (no build step for dev)
- [ ] Login flow works
- [ ] Authenticated requests succeed
- [ ] All existing commands work

### Files to Delete After Phase 5

- `tsconfig.base.json` (consolidate into single `tsconfig.json` per package if needed)

---

## Final Integration & Cleanup

**After all phases merged to `modernization/integration`:**

### Integration Test Checklist

```bash
# Full stack test
docker compose up -d

# 1. Health checks
curl http://localhost:3001/  # Lab server
curl http://localhost:3002/  # Manager server

# 2. Auth flow (browser)
# Navigate to http://localhost:3001/api/auth/signin/google

# 3. Config upload via CLI
pairit login
pairit config upload test.yaml --owner test@example.com

# 4. Media upload via CLI
pairit media upload image.png

# 5. Session flow (browser)
# Navigate to http://localhost:3001/test-config-id

# 6. Verify events stored in MongoDB
docker compose exec mongodb mongosh --eval "db.events.find()"
```

### Documentation Updates

| File | Changes |
|------|---------|
| `README.md` | Docker setup, Bun commands, remove Firebase references |
| `docs/dev/backend.md` | Elysia architecture, MongoDB schema |
| `docs/dev/storage.md` | Storage abstraction, local vs GCS |
| `docs/quickstart.md` | Update developer setup |
| `manager/cli/README.md` | Update with auth flow |

### Final Merge

Once all integration tests pass:

```bash
git checkout main
git merge modernization/integration --no-ff -m "Modernize stack: Bun + Elysia + MongoDB + Better Auth"
```

---

## Summary Timeline

| Phase | Depends On | Estimated Effort | Can Parallelize |
|-------|------------|------------------|-----------------|
| Phase 1: Infrastructure | — | 1-2 days | — |
| Phase 2: Backend | Phase 1 | 3-4 days | — |
| Phase 3: Auth | Phase 2 | 2-3 days | With Phase 4 (partially) |
| Phase 4: Frontend | Phase 2 | 2-3 days | With Phase 3 |
| Phase 5: CLI | Phase 3 | 1-2 days | — |
| Integration Testing | All | 1-2 days | — |

**Total: ~10-14 days**

---

## Risk Mitigation

1. **MongoDB Schema**: Document the schema changes early (Phase 2) so all services agree on collection structure
2. **Auth Token Storage**: Decide on CLI token storage location (keychain vs file) in Phase 5 planning
3. **GCS Credentials**: Ensure service account setup is documented for production storage backend
4. **CORS**: Elysia CORS plugin needed if frontend runs separately during development