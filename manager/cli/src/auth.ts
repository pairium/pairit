import { readFile, writeFile, mkdir } from 'fs/promises';
import { chmod } from 'fs/promises';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';
import fetch from 'node-fetch';
import { createInterface } from 'readline';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createHash, randomBytes } from 'crypto';
import { createServer, Server } from 'http';
import open from 'open';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file if it exists (for development)
// Try multiple possible locations
const possibleEnvPaths = [
  resolve(__dirname, '../../../.env'), // From dist/ to project root
  resolve(process.cwd(), '.env'), // Current working directory
  join(homedir(), '.pairit.env'), // User home directory
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

// Firebase Auth REST API endpoints
// For emulator: use localhost and fake API key
// For production: use real API key and domain
const USE_EMULATOR = process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.USE_FIREBASE_EMULATOR === 'true';
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || (USE_EMULATOR ? 'fake-api-key' : '');

// Note: Project ID is not needed for Firebase Auth REST API calls
// It's only used in getFunctionsBaseUrl() for constructing emulator URLs

// Use emulator URL if emulator is detected, otherwise use production
const AUTH_BASE_URL = USE_EMULATOR 
  ? `http://localhost:9099/identitytoolkit.googleapis.com/v1`
  : `https://identitytoolkit.googleapis.com/v1`;

const OAUTH_REDIRECT_PORT_START = 9000;
const OAUTH_REDIRECT_PORT_END = 9010;
const OAUTH_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// Google OAuth configuration
// Client ID and Secret must be created in Google Cloud Console as "Desktop app" type
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

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
        return await refreshToken(token.refreshToken);
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
 */
async function refreshToken(refreshToken: string): Promise<AuthToken | null> {
  try {
    // Read current token directly from file to preserve provider (avoid circular dependency)
    let currentProvider: AuthProvider = 'email';
    try {
      if (existsSync(AUTH_FILE)) {
        const content = await readFile(AUTH_FILE, 'utf8');
        const currentToken = JSON.parse(content) as AuthToken;
        if (currentToken.provider) {
          currentProvider = currentToken.provider;
        }
      }
    } catch (error) {
      // Ignore errors reading current token, use default provider
    }

    const response = await fetch(`${AUTH_BASE_URL}/token?key=${FIREBASE_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
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
      refreshToken: data.refresh_token || refreshToken,
      expiresAt: expiresAt.toISOString(),
      uid: data.user_id,
      email: null, // Email not returned in refresh response
      provider: currentProvider, // Preserve original provider
    };

    await saveToken(token);
    return token;
  } catch (error) {
    console.error('Token refresh failed:', error instanceof Error ? error.message : 'unknown error');
    return null;
  }
}

/**
 * Prompt for email address
 */
function promptEmail(): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question('Email: ', (email) => {
      rl.close();
      resolve(email.trim());
    });
  });
}

/**
 * Create callback server for email link authentication
 * Handles the oobCode parameter from Firebase email link
 */
async function createEmailLinkCallbackServer(
  startPort: number,
  endPort: number,
  timeoutMs: number
): Promise<{ server: Server; port: number; promise: Promise<string> }> {
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
      let callbackPromiseResolve: (value: string) => void;
      let callbackPromiseReject: (reason?: any) => void;
      const callbackPromise = new Promise<string>((resolve, reject) => {
        callbackPromiseResolve = resolve;
        callbackPromiseReject = reject;

        timeoutId = setTimeout(() => {
          cleanup();
          reject(new Error('Email link authentication timed out. Please try again.'));
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
        
        if (url.pathname === '/emaillink') {
          const oobCode = url.searchParams.get('oobCode');
          const error = url.searchParams.get('error');

          if (error) {
            cleanup();
            res.writeHead(400);
            res.end(`Email link error: ${error}`);
            callbackPromiseReject(new Error(`Email link error: ${error}`));
            return;
          }

          if (!oobCode) {
            cleanup();
            res.writeHead(400);
            res.end('Missing oobCode parameter');
            callbackPromiseReject(new Error('Missing oobCode parameter'));
            return;
          }

          cleanup();
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body>
                <h1>Authentication successful!</h1>
                <p>You can close this window and return to the terminal.</p>
              </body>
            </html>
          `);
          callbackPromiseResolve(oobCode);
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

        server.listen(port, '127.0.0.1');
      });

      return { server, port, promise: callbackPromise };
    } catch (error) {
      if (port === endPort) {
        throw new Error(`No available ports in range ${startPort}-${endPort}`);
      }
    }
  }
  
  throw new Error(`No available ports in range ${startPort}-${endPort}`);
}

/**
 * Send sign-in email link via Firebase REST API
 */
async function sendSignInLink(email: string, continueUrl: string): Promise<void> {
  const response = await fetch(`${AUTH_BASE_URL}/accounts:sendOobCode?key=${FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestType: 'EMAIL_SIGNIN',
      email,
      continueUrl,
      canHandleCodeInApp: true,
    }),
  });

  if (!response.ok) {
    const error = (await response.json()) as { error?: { message?: string } };
    const errorMessage = error.error?.message || 'Failed to send sign-in email';
    
    if (errorMessage === 'EMAIL_NOT_FOUND') {
      throw new Error('Email address not found. Please check the email and try again.');
    }
    if (errorMessage === 'OPERATION_NOT_ALLOWED') {
      throw new Error(
        'Email link sign-in is not enabled in Firebase Console.\n\n' +
        'To enable it:\n' +
        '  1. Go to Firebase Console (https://console.firebase.google.com)\n' +
        '  2. Select your project\n' +
        '  3. Navigate to Authentication > Sign-in method\n' +
        '  4. Click on "Email/Password" provider\n' +
        '  5. Enable "Email link (passwordless sign-in)"\n' +
        '  6. Save\n\n' +
        'Alternatively, use Google OAuth:\n' +
        '  pairit auth login --provider google'
      );
    }
    
    throw new Error(errorMessage);
  }
}

/**
 * Complete sign-in with email link oobCode
 */
async function signInWithEmailLink(email: string, oobCode: string): Promise<AuthToken> {
  const response = await fetch(`${AUTH_BASE_URL}/accounts:signInWithEmailLink?key=${FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      oobCode,
    }),
  });

  if (!response.ok) {
    const error = (await response.json()) as { error?: { message?: string } };
    throw new Error(error.error?.message || 'Email link sign-in failed');
  }

  const data = (await response.json()) as {
    idToken: string;
    refreshToken: string;
    expiresIn: string;
    localId: string;
    email: string;
  };

  const expiresIn = parseInt(data.expiresIn, 10);
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  const token: AuthToken = {
    idToken: data.idToken,
    refreshToken: data.refreshToken,
    expiresAt: expiresAt.toISOString(),
    uid: data.localId,
    email: data.email,
    provider: 'email',
  };

  await saveToken(token);
  return token;
}

/**
 * Authenticate with email link (passwordless magic link)
 * Sends a sign-in link to the user's email, then waits for callback
 */
export async function loginWithEmail(): Promise<AuthToken> {
  if (USE_EMULATOR) {
    throw new Error(
      'Email link authentication is not supported with Firebase Auth emulator.\n' +
      'The emulator does not support email link sign-in flows.\n\n' +
      'For production use:\n' +
      '  1. Unset USE_FIREBASE_EMULATOR\n' +
      '  2. Set FIREBASE_API_KEY\n' +
      '  3. Enable Email link sign-in in Firebase Console\n\n' +
      'For testing with emulator, use Google OAuth with production Firebase.'
    );
  }

  if (!FIREBASE_API_KEY) {
    throw new Error(
      'FIREBASE_API_KEY environment variable is required for email authentication.\n' +
      'Set: export FIREBASE_API_KEY=your-firebase-api-key'
    );
  }

  const email = await promptEmail();

  // Create callback server
  let callbackServer: { server: Server; port: number; promise: Promise<string> };
  try {
    callbackServer = await createEmailLinkCallbackServer(
      OAUTH_REDIRECT_PORT_START,
      OAUTH_REDIRECT_PORT_END,
      OAUTH_TIMEOUT_MS
    );
  } catch (error) {
    throw new Error(
      `Failed to create email link callback server: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }

  const continueUrl = `http://127.0.0.1:${callbackServer.port}/emaillink`;

  // Send sign-in email
  try {
    await sendSignInLink(email, continueUrl);
    console.log(`✓ Sign-in link sent to ${email}`);
    console.log('Please check your email and click the sign-in link. (If you don\'t see it, check your spam folder.)');
    console.log('Waiting for authentication...');
  } catch (error) {
    callbackServer.server.close();
    throw error;
  }

  // Wait for callback with oobCode
  let oobCode: string;
  try {
    oobCode = await callbackServer.promise;
  } catch (error) {
    throw new Error(
      `Email link callback failed: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }

  // Complete sign-in
  try {
    const token = await signInWithEmailLink(email, oobCode);
    console.log('✓ Email link sign-in successful');
    return token;
  } catch (error) {
    throw new Error(
      `Email link sign-in failed: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }
}

/**
 * Generate PKCE code verifier (43-128 chars, URL-safe)
 */
function generateCodeVerifier(): string {
  // Generate 32 random bytes (256 bits) = 43 chars when base64url encoded
  const bytes = randomBytes(32);
  return bytes.toString('base64url');
}

/**
 * Generate PKCE code challenge from verifier
 * Returns base64url(SHA256(verifier))
 */
function generateCodeChallenge(verifier: string): string {
  const hash = createHash('sha256').update(verifier).digest();
  return hash.toString('base64url');
}

/**
 * Generate random state token for CSRF protection
 */
function generateStateToken(): string {
  return randomBytes(16).toString('base64url');
}

/**
 * Find available port and create bound callback server atomically
 * Returns both the server and port to prevent race conditions
 */
async function createCallbackServer(
  startPort: number,
  endPort: number,
  expectedState: string,
  timeoutMs: number
): Promise<{ server: Server; port: number; promise: Promise<{ code: string; state: string }> }> {
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

      // Create promise for callback result (must be created before request handler)
      let callbackPromiseResolve: (value: { code: string; state: string }) => void;
      let callbackPromiseReject: (reason?: any) => void;
      const callbackPromise = new Promise<{ code: string; state: string }>((resolve, reject) => {
        callbackPromiseResolve = resolve;
        callbackPromiseReject = reject;

        timeoutId = setTimeout(() => {
          cleanup();
          reject(new Error('OAuth flow timed out. Please try again.'));
        }, timeoutMs);
      });

      // Set up request handler before binding
      server.on('request', (req, res) => {
        if (!req.url) {
          res.writeHead(400);
          res.end('Bad Request');
          return;
        }

        const url = new URL(req.url, `http://127.0.0.1:${port}`);
        
        if (url.pathname === '/oauth2callback') {
          const code = url.searchParams.get('code');
          const state = url.searchParams.get('state');
          const error = url.searchParams.get('error');

          if (error) {
            cleanup();
            res.writeHead(400);
            res.end(`OAuth error: ${error}`);
            callbackPromiseReject(new Error(`OAuth error: ${error}`));
            return;
          }

          if (!code || !state) {
            cleanup();
            res.writeHead(400);
            res.end('Missing code or state parameter');
            callbackPromiseReject(new Error('Missing code or state parameter'));
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

          cleanup();
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body>
                <h1>Authentication successful!</h1>
                <p>You can close this window and return to the terminal.</p>
              </body>
            </html>
          `);
          callbackPromiseResolve({ code, state });
        } else {
          res.writeHead(404);
          res.end('Not Found');
        }
      });

      // Wait for server to bind successfully (atomic operation)
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
 * Build Google OAuth URL with PKCE parameters
 * Uses Google's OAuth 2.0 endpoint directly (not Firebase's auth handler)
 */
function buildGoogleOAuthUrl(
  clientId: string,
  redirectUri: string,
  codeChallenge: string,
  state: string
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    access_type: 'offline',
    prompt: 'consent',
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange Google authorization code for tokens
 */
async function exchangeGoogleCode(
  code: string,
  codeVerifier: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string
): Promise<{ idToken: string; accessToken: string; refreshToken?: string }> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      code_verifier: codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }).toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google token exchange failed: ${error}`);
  }

  const data = (await response.json()) as {
    id_token: string;
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  return {
    idToken: data.id_token,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
  };
}

/**
 * Exchange Google ID token for Firebase ID token
 * Uses Firebase REST API signInWithIdp endpoint
 */
async function exchangeGoogleTokenForFirebase(
  googleIdToken: string
): Promise<AuthToken> {
  if (!FIREBASE_API_KEY) {
    throw new Error(
      'FIREBASE_API_KEY environment variable is required for OAuth authentication.\n' +
      'Set: export FIREBASE_API_KEY=your-firebase-api-key'
    );
  }

  const response = await fetch(`${AUTH_BASE_URL}/accounts:signInWithIdp?key=${FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestUri: 'http://localhost',
      postBody: `id_token=${encodeURIComponent(googleIdToken)}&providerId=google.com`,
      returnSecureToken: true,
      returnIdpCredential: true,
    }),
  });

  if (!response.ok) {
    const error = (await response.json()) as { error?: { message?: string } };
    throw new Error(error.error?.message || 'Firebase token exchange failed');
  }

  const data = (await response.json()) as {
    idToken: string;
    refreshToken: string;
    expiresIn: string;
    localId: string;
    email?: string;
  };

  const expiresIn = parseInt(data.expiresIn, 10);
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  const token: AuthToken = {
    idToken: data.idToken,
    refreshToken: data.refreshToken,
    expiresAt: expiresAt.toISOString(),
    uid: data.localId,
    email: data.email || null,
    provider: 'google',
  };

  await saveToken(token);
  return token;
}

/**
 * Security: Authenticate with Google Sign-In via OAuth flow
 * Uses a local server to receive the OAuth callback
 */
export async function loginWithGoogle(): Promise<AuthToken> {
  if (USE_EMULATOR) {
    throw new Error(
      'OAuth authentication is not supported with Firebase Auth emulator.\n' +
      'The emulator does not support OAuth flows (Google Sign-In, etc.).\n\n' +
      'To use OAuth:\n' +
      '  1. Use production Firebase (unset USE_FIREBASE_EMULATOR)\n' +
      '  2. Create Google OAuth Client ID (Desktop app type)\n' +
      '  3. Enable Google Sign-In in Firebase Console\n' +
      '  4. Set GOOGLE_CLIENT_ID and FIREBASE_API_KEY'
    );
  }

  if (!GOOGLE_CLIENT_ID) {
    throw new Error(
      'GOOGLE_CLIENT_ID environment variable is required for OAuth authentication.\n\n' +
      'Setup instructions:\n' +
      '  1. Go to Google Cloud Console (https://console.cloud.google.com)\n' +
      '  2. Select your project (same as Firebase project)\n' +
      '  3. Navigate to APIs & Services > Credentials\n' +
      '  4. Create OAuth 2.0 Client ID (Application type: Desktop app)\n' +
      '  5. Copy the Client ID and Client Secret, then set:\n' +
      '     export GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"\n' +
      '     export GOOGLE_CLIENT_SECRET="your-client-secret"\n\n' +
      'Also ensure FIREBASE_API_KEY is set for your project.'
    );
  }

  if (!GOOGLE_CLIENT_SECRET) {
    throw new Error(
      'GOOGLE_CLIENT_SECRET environment variable is required for OAuth authentication.\n\n' +
      'Get your Client Secret from Google Cloud Console:\n' +
      '  1. Go to APIs & Services > Credentials\n' +
      '  2. Click on your OAuth 2.0 Client ID\n' +
      '  3. Copy the "Client secret" value\n' +
      '  4. Set: export GOOGLE_CLIENT_SECRET="your-client-secret"'
    );
  }

  if (!FIREBASE_API_KEY) {
    throw new Error(
      'FIREBASE_API_KEY environment variable is required for OAuth authentication.\n' +
      'Set: export FIREBASE_API_KEY=your-firebase-api-key'
    );
  }

  // Generate PKCE parameters
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = generateStateToken();

  // Create callback server atomically (finds port and binds in one operation)
  let callbackServer: { server: Server; port: number; promise: Promise<{ code: string; state: string }> };
  try {
    callbackServer = await createCallbackServer(
      OAUTH_REDIRECT_PORT_START,
      OAUTH_REDIRECT_PORT_END,
      state,
      OAUTH_TIMEOUT_MS
    );
  } catch (error) {
    throw new Error(
      `Failed to create OAuth callback server: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }

  const redirectUri = `http://127.0.0.1:${callbackServer.port}/oauth2callback`;

  // Build Google OAuth URL (not Firebase auth handler)
  const oauthUrl = buildGoogleOAuthUrl(GOOGLE_CLIENT_ID, redirectUri, codeChallenge, state);

  // Open browser
  try {
    await open(oauthUrl);
    console.log('Opening browser for Google Sign-In...');
    console.log('If the browser does not open, visit this URL:');
    console.log(oauthUrl);
  } catch (error) {
    // Browser might not be available (headless environment)
    console.error('Failed to open browser:', error instanceof Error ? error.message : 'unknown error');
    console.log('Please visit this URL manually:');
    console.log(oauthUrl);
  }

  // Wait for callback with authorization code
  let callbackResult: { code: string; state: string };
  try {
    callbackResult = await callbackServer.promise;
  } catch (error) {
    throw new Error(
      `OAuth callback failed: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }

  // Exchange Google authorization code for Google tokens
  let googleTokens: { idToken: string; accessToken: string };
  try {
    googleTokens = await exchangeGoogleCode(callbackResult.code, codeVerifier, redirectUri, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  } catch (error) {
    throw new Error(
      `Google token exchange failed: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }

  // Exchange Google ID token for Firebase ID token
  try {
    const token = await exchangeGoogleTokenForFirebase(googleTokens.idToken);
    console.log('✓ Google Sign-In successful');
    return token;
  } catch (error) {
    throw new Error(
      `Firebase token exchange failed: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }
}

/**
 * Security: Get current auth status
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

