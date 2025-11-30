import type { Context } from 'hono';
import { getAuth } from 'firebase-admin/auth';

export interface AuthenticatedUser {
  uid: string;
  email: string | undefined;
}

// Extend Hono context type to include user
declare module 'hono' {
  interface ContextVariableMap {
    user: AuthenticatedUser;
  }
}

const BEARER_PREFIX = 'Bearer ';

/**
 * Extracts and verifies Firebase ID token from Authorization header.
 * Security practices:
 * - Validates token format before verification
 * - Uses Firebase Admin SDK for secure token verification
 * - Returns null on any error (fail-secure)
 * - Does not leak token details in error messages
 */
export async function verifyExperimenterToken(
  authHeader: string | null | undefined,
): Promise<AuthenticatedUser | null> {
  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }

  // Validate Bearer token format
  if (!authHeader.startsWith(BEARER_PREFIX)) {
    return null;
  }

  const token = authHeader.slice(BEARER_PREFIX.length).trim();
  
  // Reject empty tokens
  if (!token || token.length === 0) {
    return null;
  }

  // Reject suspiciously long tokens (potential attack)
  if (token.length > 8192) {
    return null;
  }

  try {
    // Security: Lazy initialization - getAuth() called after initializeApp() in index.ts
    const auth = getAuth();
    
    // Verify token with Firebase Admin SDK
    // This validates: signature, expiration, issuer, audience
    const decodedToken = await auth.verifyIdToken(token, true); // checkRevoked = true

    // Extract user information
    const uid = decodedToken.uid;
    const email = decodedToken.email;

    // Validate UID exists
    if (!uid || typeof uid !== 'string') {
      return null;
    }

    return {
      uid,
      email: email ?? undefined,
    };
  } catch (error) {
    // Log error for monitoring but don't leak details to client
    // Common errors: expired token, invalid signature, revoked token
    console.error('Token verification failed:', error instanceof Error ? error.message : 'unknown error');
    return null;
  }
}

/**
 * Hono middleware to require authentication.
 * Security practices:
 * - Sets user context only after successful verification
 * - Returns 401 with proper WWW-Authenticate header
 * - Does not expose internal error details
 */
export async function requireAuth(c: Context, next: () => Promise<void>) {
  const authHeader = c.req.header('Authorization');
  const user = await verifyExperimenterToken(authHeader);

  if (!user) {
    return c.json(
      { error: 'authentication_required', message: 'Authentication required. Run "pairit auth login".' },
      401,
      {
        'WWW-Authenticate': 'Bearer',
      },
    );
  }

  // Set authenticated user in context for route handlers
  c.set('user', user);
  await next();
}

