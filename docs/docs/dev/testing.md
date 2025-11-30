# Testing Authentication

This document describes how to test the authentication implementation with Firebase emulators.

## Prerequisites

1. Firebase CLI installed: `npm i -g firebase-tools`
2. Firebase project configured: `firebase use pairit-lab` (or your project)
3. Dependencies installed: `pnpm install`

## Automated Test Suite

Run the complete automated test suite:

```bash
pnpm test:auth
```

This runs `tests/auth/run-all.sh` which handles building functions, starting emulators, running tests, and cleanup automatically. See the script comments for details.

### What Gets Tested

**Basic Tests** (no emulator required):
- Unauthenticated access returns 401
- Invalid token format returns 401
- Missing Bearer prefix returns 401

**Comprehensive Tests** (requires emulator):
- Authenticated access works
- Owner assignment on config upload
- Ownership verification on delete
- Unauthorized operations blocked (403)
- Invalid tokens rejected

## Manual Test Commands

If you need to run tests individually:

```bash
# Basic tests only (no emulator needed)
pnpm test:auth:basic

# Comprehensive tests (requires emulator running)
pnpm test:auth:full
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
- ✅ File permissions secure (0600)

## Security Checklist

- ✅ Unauthenticated access blocked
- ✅ Invalid tokens rejected
- ✅ Owner assignment server-side only
- ✅ Ownership verification on mutations
- ✅ Firestore rules enforce ownership
- ✅ Token storage secure (file permissions)
- ✅ Error messages don't leak information
- ✅ HTTPS enforced in production

