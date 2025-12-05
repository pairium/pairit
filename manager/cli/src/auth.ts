/**
 * CLI Authentication Module
 * 
 * Handles authentication for the Pairit CLI. Uses server-side auth flows
 * so users don't need to configure any secrets locally.
 * 
 * Supported methods:
 * - Google OAuth: `pairit auth login --provider google`
 * - Email Link: `pairit auth login --provider email` (default)
 * 
 * Both methods use the same flow:
 * 1. CLI starts local callback server on port 9000-9010
 * 2. CLI opens browser to server's /auth/login endpoint
 * 3. User authenticates on the server (Google OAuth or Email Link)
 * 4. Server redirects back to CLI's localhost with Firebase tokens
 * 5. CLI stores tokens locally
 * 
 * No secrets required: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and FIREBASE_API_KEY
 * are all handled server-side.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { chmod } from 'fs/promises';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { randomBytes } from 'crypto';
import { createServer, Server } from 'http';
import open from 'open';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file if it exists (for development overrides)
const possibleEnvPaths = [
  resolve(__dirname, '../../../.env'),
  resolve(process.cwd(), '.env'),
  join(homedir(), '.pairit.env'),
];

for (const envPath of possibleEnvPaths) {
  if (existsSync(envPath)) {
    config({ path: envPath });
    break;
  }
}

// Security: Store tokens in user config directory with restricted permissions
const AUTH_DIR = join(homedir(), '.config', 'pairit');
const AUTH_FILE = join(AUTH_DIR, 'auth.json');

// Server-side auth URL (no secrets needed on CLI)
const PAIRIT_AUTH_BASE_URL = process.env.PAIRIT_AUTH_BASE_URL || process.env.PAIRIT_FUNCTIONS_BASE_URL || 'https://manager-pdxzcarxcq-uk.a.run.app';

// For token refresh only (optional, if not set user will need to re-login when token expires)
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || '';
const FIREBASE_AUTH_URL = 'https://identitytoolkit.googleapis.com/v1';

// Emulator detection (for development)
const USE_EMULATOR = process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.USE_FIREBASE_EMULATOR === 'true';

// OAuth callback server configuration
const OAUTH_REDIRECT_PORT_START = 9000;
const OAUTH_REDIRECT_PORT_END = 9010;
const OAUTH_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// Auth provider types
type AuthProvider = 'google' | 'email';

export interface AuthToken {
  idToken: string;
  refreshToken: string;
  expiresAt: string; // ISO timestamp
  uid: string;
  email: string | null;
  provider: AuthProvider;
}

/**
 * Security: Read stored auth token with proper error handling
 */
export async function getStoredToken(): Promise<AuthToken | null> {
  try {
    if (!existsSync(AUTH_FILE)) {
      return null;
    }

    const content = await readFile(AUTH_FILE, 'utf8');
    const token = JSON.parse(content) as AuthToken;

    // Security: Validate token structure
    if (!token.idToken || !token.refreshToken || !token.uid) {
      return null;
    }

    // Security: Check if token is expired
    if (token.expiresAt) {
      const expiresAt = new Date(token.expiresAt);
      if (expiresAt <= new Date()) {
        // Token expired, try to refresh
        return await refreshToken(token.refreshToken, token.provider);
      }
    }

    return token;
  } catch (error) {
    console.error('Failed to read auth token:', error instanceof Error ? error.message : 'unknown error');
    if (error instanceof Error) {
      console.error('Stack trace:', error.stack);
    }
    return null;
  }
}

/**
 * Security: Save auth token with restricted file permissions (600 = owner read/write only)
 */
export async function saveToken(token: AuthToken): Promise<void> {
  try {
    // Security: Create directory if it doesn't exist
    if (!existsSync(AUTH_DIR)) {
      await mkdir(AUTH_DIR, { recursive: true, mode: 0o700 });
    }

    // Security: Write token to file
    await writeFile(AUTH_FILE, JSON.stringify(token, null, 2), { mode: 0o600 });
    
    // Security: Ensure file permissions are restricted (owner read/write only)
    await chmod(AUTH_FILE, 0o600);
  } catch (error) {
    throw new Error(`Failed to save auth token: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
}

/**
 * Security: Clear stored auth token
 */
export async function clearToken(): Promise<void> {
  try {
    if (existsSync(AUTH_FILE)) {
      await writeFile(AUTH_FILE, '', { mode: 0o600 });
    }
  } catch (error) {
    // Ignore errors when clearing
  }
}

/**
 * Security: Refresh expired token using refresh token
 * 
 * Note: Token refresh requires FIREBASE_API_KEY. If not available,
 * returns null and user will need to re-authenticate.
 */
async function refreshToken(refreshTokenValue: string, provider: AuthProvider): Promise<AuthToken | null> {
  try {
    // Token refresh requires Firebase API key
    if (!FIREBASE_API_KEY) {
      console.log('Token expired. Please run "pairit auth login" to re-authenticate.');
      return null;
    }

    const authUrl = USE_EMULATOR
      ? `http://localhost:9099/identitytoolkit.googleapis.com/v1`
      : FIREBASE_AUTH_URL;

    const response = await fetch(`${authUrl}/token?key=${FIREBASE_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshTokenValue,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      id_token: string;
      refresh_token?: string;
      expires_in: string;
      user_id: string;
    };

    // Security: Calculate expiration time
    const expiresIn = parseInt(data.expires_in, 10);
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    const token: AuthToken = {
      idToken: data.id_token,
      refreshToken: data.refresh_token || refreshTokenValue,
      expiresAt: expiresAt.toISOString(),
      uid: data.user_id,
      email: null, // Email not returned in refresh response
      provider, // Preserve original provider
    };

    await saveToken(token);
    return token;
  } catch (error) {
    console.error('Token refresh failed:', error instanceof Error ? error.message : 'unknown error');
    return null;
  }
}

/**
 * Generate random state token for CSRF protection
 */
function generateStateToken(): string {
  return randomBytes(16).toString('base64url');
}

/**
 * Server-side auth callback response type
 */
interface ServerAuthCallbackParams {
  id_token: string;
  refresh_token: string;
  expires_in: string;
  uid: string;
  email?: string;
  provider?: string;
  state: string;
}

/**
 * Create callback server for server-side auth flow
 * Receives tokens directly from the Pairit server
 */
async function createAuthCallbackServer(
  startPort: number,
  endPort: number,
  expectedState: string,
  timeoutMs: number
): Promise<{ server: Server; port: number; promise: Promise<ServerAuthCallbackParams> }> {
  for (let port = startPort; port <= endPort; port++) {
    try {
      const server = createServer();
      let timeoutId: NodeJS.Timeout | null = null;

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        if (server) {
          server.close();
        }
      };

      // Create promise for callback result
      let callbackPromiseResolve: (value: ServerAuthCallbackParams) => void;
      let callbackPromiseReject: (reason?: any) => void;
      const callbackPromise = new Promise<ServerAuthCallbackParams>((resolve, reject) => {
        callbackPromiseResolve = resolve;
        callbackPromiseReject = reject;

        timeoutId = setTimeout(() => {
          cleanup();
          reject(new Error('Authentication timed out. Please try again.'));
        }, timeoutMs);
      });

      // Set up request handler
      server.on('request', (req, res) => {
        if (!req.url) {
          res.writeHead(400);
          res.end('Bad Request');
          return;
        }

        const url = new URL(req.url, `http://127.0.0.1:${port}`);
        
        if (url.pathname === '/oauth2callback') {
          const state = url.searchParams.get('state');
          const error = url.searchParams.get('error');
          const idToken = url.searchParams.get('id_token');
          const refreshToken = url.searchParams.get('refresh_token');
          const expiresIn = url.searchParams.get('expires_in');
          const uid = url.searchParams.get('uid');
          const email = url.searchParams.get('email');
          const provider = url.searchParams.get('provider');

          if (error) {
            cleanup();
            res.writeHead(400);
            res.end(`Authentication error: ${error}`);
            callbackPromiseReject(new Error(`Authentication error: ${error}`));
            return;
          }

          // Validate state parameter (CSRF protection)
          if (state !== expectedState) {
            cleanup();
            res.writeHead(400);
            res.end('Invalid callback parameters');
            callbackPromiseReject(new Error('Authentication failed: invalid callback parameters'));
            return;
          }

          if (!idToken || !refreshToken || !expiresIn || !uid) {
            cleanup();
            res.writeHead(400);
            res.end('Missing token parameters');
            callbackPromiseReject(new Error('Missing token parameters from server'));
            return;
          }

          cleanup();
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: system-ui; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #1a1a2e; color: #e4e4e7;">
                <div style="text-align: center;">
                  <h1 style="color: #4ade80;">Authentication successful!</h1>
                  <p>You can close this window and return to the terminal.</p>
                </div>
              </body>
            </html>
          `);
          callbackPromiseResolve({
            id_token: idToken,
            refresh_token: refreshToken,
            expires_in: expiresIn,
            uid,
            email: email ?? undefined,
            provider: provider ?? undefined,
            state,
          });
        } else {
          res.writeHead(404);
          res.end('Not Found');
        }
      });

      // Wait for server to bind
      await new Promise<void>((resolve, reject) => {
        server.once('listening', () => {
          resolve();
        });
        server.once('error', (err: NodeJS.ErrnoException) => {
          if (err.code === 'EADDRINUSE') {
            reject(new Error(`Port ${port} in use`));
          } else {
            reject(err);
          }
        });

        // Bind to IPv4 explicitly to avoid IPv6/IPv4 mismatch
        server.listen(port, '127.0.0.1');
      });

      return { server, port, promise: callbackPromise };
    } catch (error) {
      if (port === endPort) {
        throw new Error(`No available ports in range ${startPort}-${endPort}`);
      }
      // Continue to next port
    }
  }
  
  throw new Error(`No available ports in range ${startPort}-${endPort}`);
}

/**
 * Authenticate using server-side flow
 * 
 * This is the main authentication function that works for both Google OAuth
 * and Email Link authentication. All secrets are handled server-side.
 * 
 * @param provider - 'google' for Google OAuth, 'email' for Email Link
 */
async function loginWithServerAuth(provider: AuthProvider): Promise<AuthToken> {
  if (USE_EMULATOR) {
    throw new Error(
      'Server-side authentication is not supported with Firebase Auth emulator.\n' +
      'To use authentication, unset USE_FIREBASE_EMULATOR and connect to production Firebase.'
    );
  }

  // Generate state token for CSRF protection
  const state = generateStateToken();

  // Create callback server to receive tokens from server
  let callbackServer: { server: Server; port: number; promise: Promise<ServerAuthCallbackParams> };
  try {
    callbackServer = await createAuthCallbackServer(
      OAUTH_REDIRECT_PORT_START,
      OAUTH_REDIRECT_PORT_END,
      state,
      OAUTH_TIMEOUT_MS
    );
  } catch (error) {
    throw new Error(
      `Failed to create auth callback server: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }

  // Build server-side auth URL
  const authUrl = new URL('/auth/login', PAIRIT_AUTH_BASE_URL);
  authUrl.searchParams.set('redirect_port', callbackServer.port.toString());
  authUrl.searchParams.set('state', state);
  if (provider === 'google') {
    authUrl.searchParams.set('provider', 'google');
  }
  // For email, we don't set provider so user sees the login page with email form

  // Open browser
  try {
    await open(authUrl.toString());
    if (provider === 'google') {
      console.log('Opening browser for Google Sign-In...');
    } else {
      console.log('Opening browser for Email Sign-In...');
    }
    console.log('If the browser does not open, visit this URL:');
    console.log(authUrl.toString());
  } catch (error) {
    // Browser might not be available (headless environment)
    console.error('Failed to open browser:', error instanceof Error ? error.message : 'unknown error');
    console.log('Please visit this URL manually:');
    console.log(authUrl.toString());
  }

  // Wait for callback with tokens
  let callbackResult: ServerAuthCallbackParams;
  try {
    callbackResult = await callbackServer.promise;
  } catch (error) {
    throw new Error(
      `Authentication failed: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }

  // Build and save token
  const expiresIn = parseInt(callbackResult.expires_in, 10);
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  // Use provider from server response if available, otherwise use what we requested
  const actualProvider = (callbackResult.provider as AuthProvider) || provider;

  const token: AuthToken = {
    idToken: callbackResult.id_token,
    refreshToken: callbackResult.refresh_token,
    expiresAt: expiresAt.toISOString(),
    uid: callbackResult.uid,
    email: callbackResult.email ?? null,
    provider: actualProvider,
  };

  await saveToken(token);
  
  const methodName = actualProvider === 'google' ? 'Google Sign-In' : 'Email Sign-In';
  console.log(`✓ ${methodName} successful`);
  
  return token;
}

/**
 * Authenticate with Email Link (passwordless magic link)
 * 
 * Uses server-side auth flow - no secrets needed locally.
 */
export async function loginWithEmail(): Promise<AuthToken> {
  return loginWithServerAuth('email');
}

/**
 * Authenticate with Google Sign-In via OAuth
 * 
 * Uses server-side auth flow - no secrets needed locally.
 */
export async function loginWithGoogle(): Promise<AuthToken> {
  return loginWithServerAuth('google');
}

/**
 * Get current auth status
 */
export async function getAuthStatus(): Promise<{ authenticated: boolean; user?: { uid: string; email: string | null } }> {
  const token = await getStoredToken();
  
  if (!token) {
    return { authenticated: false };
  }

  return {
    authenticated: true,
    user: {
      uid: token.uid,
      email: token.email,
    },
  };
}
