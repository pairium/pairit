# Authentication & Security

## Overview

Pairit implements Firebase Authentication for experimenter operations (config and media management) while maintaining anonymous participation for experiments. This document outlines the security practices implemented.

> **Deploying to a new project?** See the [Deployment Guide](deployment.md) for required IAM roles, APIs, and Firebase settings.

## Security Architecture

### Authentication Flow

**Experimenters (Manager API):**
- All manager endpoints require Firebase ID token authentication
- Tokens verified server-side using Firebase Admin SDK
- User identity extracted from verified token (no client-controlled owner fields)

**Participants (Lab API):**
- Anonymous participation supported (no auth required)
- Session-based tracking via sessionId
- Future: Optional participant authentication for multi-device continuity

## Security Practices Implemented

### 1. Token Verification

**Manager Functions (`manager/functions/src/auth.ts`):**

- **Token Format Validation**: Validates Bearer token format before verification
- **Length Limits**: Rejects suspiciously long tokens (>8192 chars) to prevent DoS
- **Firebase Admin SDK**: Uses `auth.verifyIdToken()` with `checkRevoked=true` to verify:
  - Token signature
  - Token expiration
  - Token issuer (Firebase)
  - Token revocation status
- **Fail-Secure**: Returns null on any error (doesn't leak error details)
- **Error Logging**: Logs verification failures server-side for monitoring without exposing details to clients

### 2. Authorization & Ownership

**Config Ownership:**
- Owner field set server-side from authenticated user's UID (prevents owner spoofing)
- All config mutations verify ownership before allowing changes
- Firestore security rules enforce ownership at database level

**Media Ownership:**
- All media operations require authentication
- Future: Track media ownership per authenticated user

**Authorization Checks:**
- Delete operations verify ownership before deletion
- List operations filter by authenticated user automatically
- 403 Forbidden returned for unauthorized access attempts

### 3. Secure Token Storage (CLI)

**File Permissions:**
- Tokens stored in `~/.config/pairit/auth.json` with mode `0600` (owner read/write only)
- Directory created with mode `0700` (owner access only)
- Prevents other users on the system from reading tokens

**Token Structure:**
- Stores: `idToken`, `refreshToken`, `expiresAt`, `uid`, `email`, `provider`
- `provider` field: `'email'` for email link auth, `'google'` for OAuth
- Provider field is metadata only (backend doesn't use it)
- Expiration tracking for automatic refresh
- No passwords stored (email link is passwordless)
- Same token structure regardless of authentication method

**Token Refresh:**
- Automatic refresh when token expires
- Uses refresh token to obtain new ID token
- Preserves provider field (`email` or `google`) during refresh
- Handles refresh failures gracefully
- Backward compatible with tokens missing provider field

### 4. Input Validation & Sanitization

**Config ID Validation:**
- Validates configId is non-empty string
- Trims whitespace
- Prevents injection attacks

**Token Validation:**
- Validates token format before processing
- Rejects empty or malformed tokens
- Length limits prevent buffer overflow attacks

**Request Validation:**
- All required fields validated before processing
- Type checking on all inputs
- Sanitizes user-provided strings

### 5. Error Handling & Information Disclosure

**Error Messages:**
- Generic error messages for authentication failures (don't leak token details)
- Helpful messages guide users to authenticate (`Run 'pairit auth login'`)
- Internal errors logged server-side, generic messages sent to clients

**HTTP Status Codes:**
- `401 Unauthorized`: Missing or invalid authentication
- `403 Forbidden`: Authenticated but not authorized (wrong owner)
- `400 Bad Request`: Invalid input (not auth-related)
- Proper `WWW-Authenticate: Bearer` header on 401 responses

### 6. Firestore Security Rules

**Configs Collection:**
```javascript
match /configs/{configId} {
  allow read: if request.auth != null && resource.data.owner == request.auth.uid;
  allow create: if request.auth != null && 
                  request.resource.data.owner == request.auth.uid;
  allow update, delete: if request.auth != null && 
                          resource.data.owner == request.auth.uid;
}
```

**Security Features:**
- Read: Owner only (participants access configs via API endpoints using Admin SDK, or static files)
- Write: Requires authentication AND ownership match
- Prevents unauthorized access and modifications even if API is bypassed
- Defense in depth: API + Firestore rules
- Note: Lab API endpoints use Firebase Admin SDK which bypasses security rules, so participant access via `/sessions/start` still works

### 7. HTTPS Enforcement

**Production:**
- All API endpoints served over HTTPS
- Firebase Functions enforce HTTPS
- Tokens transmitted securely

**Development:**
- Emulator supports HTTP for local development
- Production deployment enforces HTTPS

### 8. Token Expiration & Refresh

**Token Lifetime:**
- Firebase ID tokens expire after 1 hour
- Refresh tokens valid until revoked
- Automatic refresh in CLI before expiration

**Revocation:**
- Tokens checked for revocation (`checkRevoked=true`)
- Revoked tokens rejected immediately
- Supports user logout and account disable scenarios

### 9. Rate Limiting Considerations

**Current Implementation:**
- Firebase Auth has built-in rate limiting
- No additional rate limiting implemented (future enhancement)

**Future Enhancements:**
- Per-user rate limiting on API endpoints
- Per-IP rate limiting for session creation
- Configurable limits per endpoint

### 10. Secure Defaults

**Authentication Required:**
- All manager endpoints require auth by default
- No "optional" auth endpoints (clear security boundary)

**Owner Assignment:**
- Owner always set from authenticated user (never client-controlled)
- Prevents privilege escalation attacks

**Fail-Secure:**
- Authentication failures default to denying access
- No fallback to anonymous access for protected operations

### 11. OAuth Security (Google Sign-In)

**PKCE Implementation:**
- Code verifier: Random 32-byte value, base64url encoded (43 chars)
- Code challenge: SHA256 hash of verifier, base64url encoded
- Prevents authorization code interception attacks
- Required for public clients (CLI applications)

**State Parameter:**
- Random state token generated for each OAuth flow
- Validated on callback to prevent CSRF attacks
- State mismatch results in rejection

**Callback Server:**
- Local HTTP server on `localhost` (ports 9000-9010)
- Only accepts connections from localhost
- 5-minute timeout prevents hanging processes
- Automatic port discovery if primary port in use
- Graceful error handling for port conflicts

**Token Exchange:**
- Authorization code exchanged server-side using PKCE verifier
- Uses Firebase Auth REST API `/accounts:signInWithIdp` endpoint
- Validates authorization code before exchange
- Same token structure as email link authentication

**Provider Field:**
- OAuth tokens marked with `provider: 'google'`
- Email tokens marked with `provider: 'email'`
- Provider preserved during token refresh
- Backward compatible with tokens missing provider field

**Error Handling:**
- Port conflicts: Automatic fallback to alternative ports
- Browser unavailable: Manual URL provided for headless environments
- User cancellation: Cleanup and clear error message
- Timeout: Server shutdown and error message
- Network errors: Retry logic and clear error messages

## CLI Authentication

### Commands

- `pairit auth login [--provider <email|google>]`: Authenticate with email link or Google Sign-In (default: email)
- `pairit auth logout`: Clear stored authentication token
- `pairit auth status`: Check authentication status

### Authentication Methods

**Email Link (Magic Link):**
- Passwordless authentication via email
- User enters email, receives sign-in link
- Local callback server receives oobCode from link
- Uses Firebase Auth REST API `/accounts:sendOobCode` and `/accounts:signInWithEmailLink`
- Stores tokens locally with restricted permissions
- Provider field: `'email'`

**Google Sign-In (OAuth):**
- Uses OAuth 2.0 flow with PKCE
- Opens browser for Google Sign-In
- Local callback server receives authorization code
- Exchanges code for Firebase ID token
- Stores tokens locally with restricted permissions
- Provider field: `'google'`

**Similarities:**
- Both methods use local callback server (ports 9000-9010)
- Both produce identical token structures
- Tokens from both methods work identically for API calls
- Users can switch between providers seamlessly
- Token refresh works for both provider types

### Token Injection

All CLI API requests automatically include `Authorization: Bearer <token>` header if token is available. Authentication errors provide clear guidance to users. The backend treats tokens identically regardless of authentication method (email link or OAuth).

### 12. Email Link Security

**Callback Server:**
- Local HTTP server on `localhost` (ports 9000-9010)
- Receives oobCode parameter from Firebase email link
- 5-minute timeout prevents hanging processes
- Automatic port discovery if primary port in use

**Email Link Flow:**
1. User enters email address
2. CLI sends sign-in link via Firebase REST API
3. User clicks link in email
4. Browser redirects to local callback server with oobCode
5. CLI exchanges oobCode for Firebase ID token

**Firebase Console Setup:**
1. Enable Email/Password provider
2. Enable "Email link (passwordless sign-in)" option
3. Configure action URL settings (optional)

## Security Checklist

**General Authentication:**
- ✅ Token verification with Firebase Admin SDK
- ✅ Server-side owner assignment (prevents spoofing)
- ✅ Ownership verification on all mutations
- ✅ Firestore security rules enforcement
- ✅ Secure token storage (file permissions)
- ✅ Token expiration and refresh handling
- ✅ Provider field preservation during refresh
- ✅ Input validation and sanitization
- ✅ Error handling without information disclosure
- ✅ HTTPS enforcement in production
- ✅ Fail-secure defaults

**Email Link Security:**
- ✅ Passwordless authentication (no passwords stored)
- ✅ Callback server localhost-only
- ✅ 5-minute timeout prevents hanging
- ✅ Port validation (9000-9010 range only)
- ✅ oobCode validation before token exchange
- ✅ Provider field preserved during refresh

**OAuth-Specific Security:**
- ✅ PKCE implementation (code verifier/challenge)
- ✅ State parameter for CSRF protection
- ✅ Callback server localhost-only
- ✅ 5-minute timeout prevents hanging
- ✅ Port validation (9000-9010 range only)
- ✅ Authorization code validation before exchange
- ✅ Provider field preserved during refresh
- ✅ Browser opening fails gracefully (headless environments)

## Future Security Enhancements

1. **Additional OAuth Providers**: GitHub, Microsoft, etc. (extend `OAuthProvider` type)
2. **Custom Redirect Port**: Allow `--port` flag for callback server
3. **Headless Mode**: Support for environments without browser (manual code entry)
4. **Participant Authentication**: Optional Firebase Anonymous Auth for multi-device session continuity
5. **Rate Limiting**: Per-user and per-IP limits on API endpoints
6. **Audit Logging**: Track all authentication and authorization events
7. **Token Rotation**: Automatic token rotation for long-lived sessions
8. **MFA Support**: Multi-factor authentication for experimenters
9. **SSO Integration**: SAML/OAuth for institutional authentication
10. **Session Management**: Session timeout and concurrent session limits

## Security Incident Response

If a security vulnerability is discovered:

1. **Immediate**: Revoke affected tokens via Firebase Console
2. **Short-term**: Deploy security patch
3. **Long-term**: Update security practices and documentation

## References

- [Firebase Authentication Security](https://firebase.google.com/docs/auth/security)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)

