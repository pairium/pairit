# Testing Authentication

This document describes how to test the authentication implementation, including both email link (magic link) and OAuth authentication methods.

**Note:** Both email link and OAuth authentication require production Firebase. The Firebase Auth emulator does not support these flows.

## Prerequisites

1. Firebase CLI installed: `npm i -g firebase-tools`
2. Firebase project configured: `firebase use pairit-lab` (or your project)
3. Dependencies installed: `pnpm install`
4. CLI built: `pnpm --filter pairit-cli build` (for OAuth tests)

## Automated Test Suite

Run the complete automated test suite:

```bash
pnpm test:auth
```

This runs `tests/auth/run-all.sh` which handles building functions, starting emulators, running tests, and cleanup automatically. See the script comments for details.

### What Gets Tested

**Basic Tests** (`test-basic.sh` - no emulator required):
- Unauthenticated access returns 401
- Invalid token format returns 401
- Missing Bearer prefix returns 401

**Comprehensive Tests** (`test-with-emulator.sh` - requires emulator):
- Authenticated access works
- Owner assignment on config upload
- Ownership verification on delete
- Unauthorized operations blocked (403)
- Invalid tokens rejected
- Token refresh preserves provider field
- Email and OAuth tokens work identically

**OAuth Tests** (`test-oauth.sh` - requires CLI):
- OAuth login command exists and works
- PKCE implementation (code verifier/challenge generation)
- Callback server port handling (9000-9010 range)
- OAuth URL construction with Firebase-specific params
- Token exchange endpoint accessibility
- Provider field preservation during refresh
- OAuth error handling (port conflicts, timeouts, cancellation)
- Token structure compatibility (email link vs OAuth)

## Manual Test Commands

If you need to run tests individually:

```bash
# Basic tests only (no emulator needed)
pnpm test:auth:basic

# Comprehensive tests (requires emulator running)
pnpm test:auth:full

# OAuth-specific tests (requires emulator and CLI built)
bash tests/auth/test-oauth.sh
```

## Testing OAuth Flow

### Automated OAuth Component Tests

The `test-oauth.sh` script tests OAuth components programmatically:
- PKCE code verifier/challenge generation
- Callback server implementation
- Token exchange endpoint
- Provider field handling
- Error handling mechanisms

### Manual OAuth Flow Testing

**Important:** OAuth (Google Sign-In) requires production Firebase configuration. The Firebase Auth emulator does not support OAuth flows.

To test the complete OAuth flow (requires browser interaction):

1. **Configure Production Firebase:**
   - Enable Google Sign-In provider in Firebase Console
   - Add `localhost` to authorized domains
   - Get your production `FIREBASE_API_KEY` from Firebase Console

2. **Set environment variables (production, not emulator):**
   ```bash
   # Unset emulator flag
   unset USE_FIREBASE_EMULATOR
   unset FIREBASE_AUTH_EMULATOR_HOST
   
   # Set production API key
   export FIREBASE_API_KEY=your-production-api-key
   ```

3. **Build CLI:**
   ```bash
   pnpm --filter pairit-cli build
   ```

4. **Run OAuth login:**
   ```bash
   # Run from manager/cli directory (recommended):
   cd manager/cli && node dist/index.js auth login --provider google
   
   # Or use pnpm exec with node directly:
   pnpm --filter pairit-cli exec node dist/index.js auth login --provider google
   ```

5. **Complete OAuth flow:**
   - Browser should open automatically
   - Complete Google Sign-In in browser
   - Callback server receives authorization code
   - Token exchange completes automatically
   - Token stored with `provider: 'google'`

6. **Verify token:**
   ```bash
   pnpm --filter pairit-cli exec pairit auth status
   # Or: cd manager/cli && node dist/index.js auth status
   ```

7. **Test token refresh:**
   - Wait for token to expire or manually expire it
   - Make an API call that triggers refresh
   - Verify provider field is preserved

### Testing Provider Switching

Test switching between email link and OAuth providers:

1. **Login with email link:**
   ```bash
   pnpm --filter pairit-cli exec pairit auth login --provider email
   # Or: cd manager/cli && node dist/index.js auth login --provider email
   # Enter your email, then check inbox and click the sign-in link
   ```

2. **Verify provider:**
   ```bash
   # Check auth.json file
   cat ~/.config/pairit/auth.json | grep provider
   # Should show: "provider": "email"
   ```

3. **Login with Google:**
   ```bash
   pnpm --filter pairit-cli exec pairit auth login --provider google
   # Or: cd manager/cli && node dist/index.js auth login --provider google
   ```

4. **Verify provider changed:**
   ```bash
   cat ~/.config/pairit/auth.json | grep provider
   # Should show: "provider": "google"
   ```

5. **Test API calls work with both:**
   ```bash
   # Both should work identically
   pnpm --filter pairit-cli exec pairit config list
   # Or: cd manager/cli && node dist/index.js config list
   ```

## Testing Firestore Security Rules

Using Firebase Emulator UI:
1. Go to Firestore tab
2. Try to create a config document:
   - Without auth: Should fail
   - With auth: Should succeed if owner matches

## Expected Test Results

All automated tests should pass:
- ✅ Unauthenticated access returns 401
- ✅ Invalid tokens return 401
- ✅ Authenticated access returns 200
- ✅ Owner assignment works correctly
- ✅ Ownership verification blocks unauthorized operations
- ✅ Token refresh works (CLI)
- ✅ Token refresh preserves provider field
- ✅ Email link login command available
- ✅ OAuth login command available
- ✅ PKCE implementation complete
- ✅ Callback server handles port conflicts
- ✅ OAuth tokens work identically to email link tokens
- ✅ File permissions secure (0600)

## Security Checklist

**General Authentication:**
- ✅ Unauthenticated access blocked
- ✅ Invalid tokens rejected
- ✅ Owner assignment server-side only
- ✅ Ownership verification on mutations
- ✅ Firestore rules enforce ownership
- ✅ Token storage secure (file permissions)
- ✅ Error messages don't leak information
- ✅ HTTPS enforced in production

**OAuth-Specific Security:**
- ✅ PKCE implemented (code verifier/challenge)
- ✅ State parameter for CSRF protection
- ✅ Callback server localhost-only
- ✅ 5-minute timeout prevents hanging
- ✅ Port validation (9000-9010 range only)
- ✅ Provider field preserved during refresh
- ✅ Token exchange validates authorization code
- ✅ Browser opening fails gracefully (headless environments)

## Troubleshooting OAuth Tests

### Port Already in Use

If port 9000 is already in use, the callback server will automatically try ports 9001-9010. If all ports are busy:

```bash
# Find process using port
lsof -i :9000

# Kill process if needed
kill -9 <PID>
```

### Browser Not Opening

If browser doesn't open automatically:
1. Check if `open` package is installed: `pnpm --filter pairit-cli list open`
2. Manual URL will be printed - copy and paste into browser
3. For headless environments, consider implementing manual code entry (future enhancement)

### OAuth Flow Timeout

If OAuth flow times out:
1. **Verify you're using production Firebase** (not emulator - OAuth doesn't work with emulator)
2. Check environment variables are set correctly (FIREBASE_API_KEY, no USE_FIREBASE_EMULATOR)
3. Verify Google Sign-In is enabled in Firebase Console
4. Check callback server started successfully (check logs)
5. Ensure browser can access `http://localhost:9000/oauth2callback`
6. Verify `localhost` is in authorized domains in Firebase Console

### Token Exchange Fails

If token exchange fails:
1. Verify Firebase API key is correct
2. Check emulator is accessible
3. Verify authorization code was received correctly
4. Check PKCE code verifier matches challenge

## Test File Structure

```
tests/auth/
├── run-all.sh              # Main test runner (builds, starts emulators, runs all tests)
├── test-basic.sh            # Basic auth tests (no emulator needed)
├── test-with-emulator.sh    # Comprehensive tests (requires emulator)
└── test-oauth.sh            # OAuth-specific tests (requires emulator + CLI)
```

Each test file can be run independently, but `run-all.sh` orchestrates the complete test suite.

