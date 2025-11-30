# Testing Authentication

This document describes how to test the authentication implementation with Firebase emulators.

## Prerequisites

1. Firebase CLI installed: `npm i -g firebase-tools`
2. Firebase project configured: `firebase use pairit-lab` (or your project)
3. Dependencies installed: `pnpm install`

## Quick Test (Without Emulators)

Run basic tests that don't require emulators:

```bash
pnpm test:auth:basic
```

Or manually:
```bash
bash tests/auth/test-basic.sh
```

This tests:
- Unauthenticated access returns 401
- Invalid token format returns 401
- Missing Bearer prefix returns 401

## Automated Full Test Suite

Run the complete automated test suite (builds functions, starts emulators, runs tests, cleans up):

```bash
pnpm test:auth
```

This command will:
1. Build functions
2. Start Firebase emulators in the background
3. Wait for emulators to be ready
4. Run all test suites
5. Clean up emulators automatically

## Manual Full Test (With Firebase Emulators)

### Step 1: Start Firebase Emulators

```bash
# Build functions first
pnpm --filter manager-functions build
pnpm --filter lab-functions build

# Start emulators (includes Auth, Functions, Firestore)
firebase emulators:start --only auth,functions,firestore
```

The emulators will start on:
- Functions: http://127.0.0.1:5001
- Firestore: http://localhost:8080
- Auth: http://localhost:9099
- UI: http://localhost:4000

### Step 2: Run Comprehensive Tests

In another terminal:

```bash
pnpm test:auth:full
```

Or manually:
```bash
bash tests/auth/test-with-emulator.sh
```

This script will:
1. Create test users via Auth emulator
2. Get valid ID tokens
3. Test authenticated endpoints
4. Test ownership verification
5. Test unauthorized access prevention

## Manual Testing Examples

### Test 1: Create a Test User

```bash
curl -X POST 'http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key' \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"test123456","returnSecureToken":true}'
```

Save the `idToken` from the response.

### Test 2: Test Authenticated Endpoint

```bash
# Replace YOUR_ID_TOKEN with the token from Step 1
curl -X GET 'http://127.0.0.1:5001/pairit-lab/us-east4/manager/configs' \
  -H 'Authorization: Bearer YOUR_ID_TOKEN'
```

Expected: `200 OK` with empty configs array (or your configs)

### Test 3: Test Unauthenticated Access

```bash
curl -X GET 'http://127.0.0.1:5001/pairit-lab/us-east4/manager/configs'
```

Expected: `401 Unauthorized` with error message

### Test 4: Test Config Upload

```bash
curl -X POST 'http://127.0.0.1:5001/pairit-lab/us-east4/manager/configs/upload' \
  -H 'Authorization: Bearer YOUR_ID_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "configId": "test-config",
    "checksum": "abc123",
    "config": {"initialPageId": "intro", "nodes": [{"id": "intro", "text": "Hello"}]}
  }'
```

Expected: `200 OK` with config details, owner should be your user's UID

### Test 5: Test Ownership Verification

Create a second user, upload a config with first user, try to delete with second user:

```bash
# Create user 2
curl -X POST 'http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key' \
  -H 'Content-Type: application/json' \
  -d '{"email":"test2@example.com","password":"test123456","returnSecureToken":true}'

# Try to delete user 1's config with user 2's token
curl -X DELETE 'http://127.0.0.1:5001/pairit-lab/us-east4/manager/configs/test-config' \
  -H 'Authorization: Bearer USER2_ID_TOKEN'
```

Expected: `403 Forbidden` - ownership verification working

## Testing CLI Authentication

### Step 1: Set Environment Variables

```bash
export USE_FIREBASE_EMULATOR=true
export FIREBASE_PROJECT_ID=pairit-lab
export PAIRIT_FUNCTIONS_BASE_URL="http://127.0.0.1:5001/pairit-lab/us-east4/manager"
```

### Step 2: Build CLI

```bash
cd manager/cli
pnpm build
```

### Step 3: Test CLI Auth Commands

```bash
# Check auth status (should be unauthenticated)
./dist/index.js auth status

# Login (will prompt for email/password)
./dist/index.js auth login

# Check auth status (should show authenticated)
./dist/index.js auth status

# Test config upload (should work)
./dist/index.js config upload ../test-config.yaml

# Logout
./dist/index.js auth logout
```

## Testing Firestore Security Rules

### Using Firebase Emulator UI

1. Open http://localhost:4000
2. Go to Firestore tab
3. Try to create a config document:
   - Without auth: Should fail
   - With auth: Should succeed if owner matches

### Using curl

```bash
# Test Firestore rules via REST API
# Note: This requires the Firestore REST API which may not be available in emulator
# Better to use the UI or Firebase Admin SDK
```

## Expected Test Results

### ✅ All Tests Should Pass

1. **Unauthenticated Access**: Returns 401
2. **Invalid Token**: Returns 401
3. **Authenticated Access**: Returns 200 with data
4. **Owner Assignment**: Config owner set to authenticated user's UID
5. **Ownership Verification**: Cannot delete/modify other users' configs
6. **Token Refresh**: Expired tokens automatically refreshed (CLI)
7. **File Permissions**: Auth token file has 0600 permissions

## Troubleshooting

### Emulators Not Starting

- Check if ports 5001, 8080, 9099, 4000 are available
- Kill existing processes: `lsof -ti:5001 | xargs kill -9`
- Check for port conflicts: `lsof -i :5001`

### Emulator Running Old Code

If the emulator is returning errors that don't match your current code, it may be running cached/old code.

**Symptoms:**
- Error messages that don't exist in current code
- Missing expected log messages (e.g., `[AUTH-v2]` logs)

**Solution:**

1. **Stop emulator completely:**
   ```bash
   # In the terminal running emulator, press Ctrl+C
   # Then kill any remaining processes:
   pkill -f firebase
   ```

2. **Clean build:**
   ```bash
   pnpm --filter manager-functions build
   pnpm --filter lab-functions build
   ```

3. **Clear emulator cache (if exists):**
   ```bash
   rm -rf manager/functions/.firebase
   rm -rf manager/functions/.runtime*
   rm -rf .firebase
   ```

4. **Restart emulator:**
   ```bash
   firebase emulators:start --only auth,functions,firestore
   ```

5. **Verify new code is loaded:**
   Look for these log messages when the emulator starts:
   - `[AUTH-v2] Manager functions initialized`
   - `Manager functions initialized`
   - No errors about missing Firebase app

6. **Check emulator logs:**
   When making requests, you should see:
   ```
   [AUTH-v2] Config upload endpoint called
   [AUTH-v2] Body received: { configId: '...', hasChecksum: true, hasConfig: true }
   ```

**If still having issues:**

1. **Verify dist file is new:**
   ```bash
   ls -la manager/functions/dist/index.js
   # Should show recent timestamp
   ```

2. **Check which codebase is loaded:**
   - Look for "Loaded functions definitions from source: manager"
   - Verify it's loading from `manager/functions`

3. **Try touching the source file to force reload:**
   ```bash
   touch manager/functions/src/index.ts
   pnpm --filter manager-functions build
   ```

4. **Check for multiple Firebase processes:**
   ```bash
   ps aux | grep firebase
   ```
   Kill all of them and restart.

5. **Nuclear option - clear all caches:**
   ```bash
   rm -rf .firebase
   rm -rf manager/functions/.firebase
   rm -rf node_modules/.cache
   pnpm --filter manager-functions build
   firebase emulators:start --only auth,functions,firestore
   ```

### Token Verification Failing

- Ensure Auth emulator is running
- Check that token is valid (not expired)
- Verify token format: `Bearer <token>`
- Check emulator logs for verification errors

### Firestore Rules Not Enforcing

- Check `firestore.rules` file is correct
- Restart emulators after changing rules
- Verify rules are deployed: Check emulator UI at http://localhost:4000

### CLI Auth Not Working

- Check environment variables are set correctly
- Verify Firebase API key is correct (use `fake-api-key` for emulator)
- Check token file permissions: `ls -l ~/.config/pairit/auth.json`
- Ensure `USE_FIREBASE_EMULATOR=true` is set for emulator usage

## Security Checklist

- [x] Unauthenticated access blocked
- [x] Invalid tokens rejected
- [x] Owner assignment server-side only
- [x] Ownership verification on mutations
- [x] Firestore rules enforce ownership
- [x] Token storage secure (file permissions)
- [x] Error messages don't leak information
- [x] HTTPS enforced in production

## Next Steps

After testing:

1. ✅ Verify all tests pass
2. ✅ Check security practices are enforced
3. ✅ Test with production Firebase project (optional)
4. ✅ Document any issues found
5. ✅ Deploy to production

