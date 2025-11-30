# Authentication & Security

## Overview

Pairit implements Firebase Authentication for experimenter operations (config and media management) while maintaining anonymous participation for experiments. This document outlines the security practices implemented.

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
- Expiration tracking for automatic refresh
- No plaintext passwords stored

**Token Refresh:**
- Automatic refresh when token expires
- Uses refresh token to obtain new ID token
- Handles refresh failures gracefully

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

## CLI Authentication

### Commands

- `pairit auth login`: Authenticate with email/password (Google Sign-In coming soon)
- `pairit auth logout`: Clear stored authentication token
- `pairit auth status`: Check authentication status

### Authentication Methods

**Email/Password:**
- Uses Firebase Auth REST API
- Prompts securely for credentials
- Stores tokens locally with restricted permissions

**Google Sign-In:**
- Planned for future implementation
- Will use OAuth 2.0 flow with local callback server

### Token Injection

All CLI API requests automatically include `Authorization: Bearer <token>` header if token is available. Authentication errors provide clear guidance to users.

## Security Checklist

- ✅ Token verification with Firebase Admin SDK
- ✅ Server-side owner assignment (prevents spoofing)
- ✅ Ownership verification on all mutations
- ✅ Firestore security rules enforcement
- ✅ Secure token storage (file permissions)
- ✅ Token expiration and refresh handling
- ✅ Input validation and sanitization
- ✅ Error handling without information disclosure
- ✅ HTTPS enforcement in production
- ✅ Fail-secure defaults

## Future Security Enhancements

1. **Participant Authentication**: Optional Firebase Anonymous Auth for multi-device session continuity
2. **Rate Limiting**: Per-user and per-IP limits on API endpoints
3. **Audit Logging**: Track all authentication and authorization events
4. **Token Rotation**: Automatic token rotation for long-lived sessions
5. **MFA Support**: Multi-factor authentication for experimenters
6. **SSO Integration**: SAML/OAuth for institutional authentication
7. **Session Management**: Session timeout and concurrent session limits

## Security Incident Response

If a security vulnerability is discovered:

1. **Immediate**: Revoke affected tokens via Firebase Console
2. **Short-term**: Deploy security patch
3. **Long-term**: Update security practices and documentation

## References

- [Firebase Authentication Security](https://firebase.google.com/docs/auth/security)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)

