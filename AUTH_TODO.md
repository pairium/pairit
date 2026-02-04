# Auth Integration Status

Tracking auth implementation progress for Pairit.

## Current State

Auth is **mostly implemented**. Backend, CLI, and frontend protected routes work.

## Implemented

### `@pairit/auth` package
- [x] Better Auth with MongoDB adapter
- [x] Google OAuth provider configured
- [x] Email/password auth enabled
- [x] Session management (7-day expiry, cookie caching)
- [x] Types exported (User, Session, AuthContext)

### Manager Server (`apps/manager/server/`)
- [x] Auth middleware (`src/lib/auth-middleware.ts`)
- [x] Protected routes: config upload/list/delete, media upload/list/delete
- [x] Ownership-based access control (configs filtered by user.id)
- [x] CLI login flow: `/login`, `/login-success`, `/api/cli/exchange`
- [x] Single-use authorization codes (60s expiry)

### Lab Server (`apps/lab/server/`)
- [x] Auth middleware with hybrid model (`src/lib/auth-middleware.ts`)
- [x] `config.requireAuth` flag support
- [x] Public experiments: UUID-based access (Qualtrics model)
- [x] Authenticated experiments: Better Auth session validation
- [x] Optional user ID binding to sessions
- [x] 401 response for requireAuth experiments when not authenticated
- [x] `FORCE_AUTH=true` env flag for testing

### CLI (`apps/manager/cli/`)
- [x] `pairit login` command with browser OAuth flow
- [x] Loopback server for auth code receipt
- [x] Secure credential storage (keychain primary, file fallback)
- [x] Auth token sent as cookie header in API requests
- [x] Protected commands: config upload/list/delete, media upload/list/delete

### Frontend Auth (`apps/lab/app/`)
- [x] `auth-client.ts` - Better Auth client with `useSession`, `signIn`, `signOut`
- [x] Login component (Google OAuth button)
- [x] Logout component
- [x] Header with login/logout UI
- [x] Route guards for authenticated experiments
- [x] Login prompt when `config.requireAuth: true` and not authenticated
- [x] Return URL handling after login (redirects back to experiment)

## Remaining

### Medium Priority
- [ ] Prolific Integration (extract URL params, bind external participant ID)
- [ ] Email verification flow (currently disabled)
- [ ] Media per-file ownership tracking
- [ ] Audit logging for config/media changes

### Lower Priority
- [ ] Session management UI (list active sessions, logout all)
- [ ] Rate limiting on auth endpoints
- [ ] Additional OAuth providers (GitHub, Microsoft)
- [ ] Admin dashboard for user management

## Key Files

| Component | File |
|-----------|------|
| Auth config | `packages/auth/index.ts` |
| Auth types | `packages/auth/types.ts` |
| Lab middleware | `apps/lab/server/src/lib/auth-middleware.ts` |
| Manager middleware | `apps/manager/server/src/lib/auth-middleware.ts` |
| CLI auth | `apps/manager/cli/src/auth.ts` |
| Frontend client | `apps/lab/app/src/lib/auth-client.ts` |
| Login component | `apps/lab/app/src/components/Auth/Login.tsx` |
| Logout component | `apps/lab/app/src/components/Auth/Logout.tsx` |

## Environment Variables

```bash
# Required
PROJECT_ID                  # GCP project ID (used by deploy.sh)
GOOGLE_CLIENT_ID            # OAuth client ID
GOOGLE_CLIENT_SECRET        # OAuth client secret
AUTH_SECRET                 # 32+ char secret for session signing
MONGODB_URI                 # MongoDB connection string

# Optional
STORAGE_BACKEND             # "local" or "gcs" (default: local)
STORAGE_PATH                # Storage path/bucket name
FORCE_AUTH                  # Set to "true" to require auth for all experiments (testing)
```

## Testing

```bash
# Start services with env vars
source .env && NODE_ENV=development bun run dev

# Test auth-required flow (all experiments require login)
source .env && NODE_ENV=development FORCE_AUTH=true bun run dev

# Visit http://localhost:3000/simple-survey
# Should see login prompt, then experiment after Google OAuth
```
