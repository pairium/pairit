import { readFile, writeFile, mkdir } from 'fs/promises';
import { chmod } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import fetch from 'node-fetch';
import { createInterface } from 'readline';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Security: Store tokens in user config directory with restricted permissions
const AUTH_DIR = join(homedir(), '.config', 'pairit');
const AUTH_FILE = join(AUTH_DIR, 'auth.json');

// Firebase Auth REST API endpoints
// For emulator: use localhost and fake API key
// For production: use real API key and domain
const USE_EMULATOR = process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.USE_FIREBASE_EMULATOR === 'true';
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || (USE_EMULATOR ? 'fake-api-key' : '');
const FIREBASE_AUTH_DOMAIN = process.env.FIREBASE_AUTH_DOMAIN || 'pairit-lab.firebaseapp.com';

// Note: Project ID is not needed for Firebase Auth REST API calls
// It's only used in getFunctionsBaseUrl() for constructing emulator URLs

// Use emulator URL if emulator is detected, otherwise use production
const AUTH_BASE_URL = USE_EMULATOR 
  ? `http://localhost:9099/identitytoolkit.googleapis.com/v1`
  : `https://identitytoolkit.googleapis.com/v1`;
const OAUTH_REDIRECT_URI = 'http://localhost:9000/oauth2callback';

export interface AuthToken {
  idToken: string;
  refreshToken: string;
  expiresAt: string; // ISO timestamp
  uid: string;
  email: string | null;
  provider: 'google' | 'email';
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
      provider: 'email', // Default, will be updated on next login
    };

    await saveToken(token);
    return token;
  } catch (error) {
    console.error('Token refresh failed:', error instanceof Error ? error.message : 'unknown error');
    return null;
  }
}

/**
 * Security: Prompt for email and password securely
 */
function promptCredentials(): Promise<{ email: string; password: string }> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question('Email: ', (email) => {
      rl.question('Password: ', (password) => {
        rl.close();
        resolve({ email: email.trim(), password });
      });
    });
  });
}

/**
 * Security: Authenticate with email/password
 */
export async function loginWithEmail(): Promise<AuthToken> {
  if (!FIREBASE_API_KEY) {
    throw new Error(
      'FIREBASE_API_KEY environment variable is required for email authentication.\n' +
      'For emulator: export USE_FIREBASE_EMULATOR=true\n' +
      'For production: export FIREBASE_API_KEY=your-api-key'
    );
  }

  const { email, password } = await promptCredentials();

  const response = await fetch(`${AUTH_BASE_URL}/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true,
    }),
  });

  if (!response.ok) {
    const error = (await response.json()) as { error?: { message?: string } };
    throw new Error(error.error?.message || 'Authentication failed');
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
 * Security: Authenticate with Google Sign-In via OAuth flow
 * Uses a local server to receive the OAuth callback
 */
export async function loginWithGoogle(): Promise<AuthToken> {
  // For Google Sign-In, we'll use a simplified approach:
  // Open browser for OAuth, then use the authorization code
  // This requires Firebase Web SDK configuration
  
  console.log('Google Sign-In requires Firebase Web SDK configuration.');
  console.log('For now, please use email/password authentication.');
  console.log('Google Sign-In will be implemented in a future update.');
  
  throw new Error('Google Sign-In not yet implemented. Use email/password authentication.');
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

