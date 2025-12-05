/**
 * Server-side authentication flow for CLI.
 * 
 * This module handles authentication server-side so CLI users don't need
 * to configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, or FIREBASE_API_KEY.
 * 
 * Supported methods:
 * - Google OAuth: Browser-based OAuth flow
 * - Email Link: Passwordless magic link via email
 * 
 * Flow (both methods):
 * 1. CLI starts local callback server on port 9000-9010
 * 2. CLI opens browser to /auth/login?redirect_port=PORT&state=STATE
 * 3. User authenticates (Google OAuth or Email Link)
 * 4. Server handles token exchange (has the secrets)
 * 5. Server redirects to http://localhost:PORT/callback with Firebase tokens
 * 6. CLI receives and stores tokens
 */

import { Hono } from 'hono';
import { html } from 'hono/html';
import { createHash, randomBytes } from 'crypto';

// Configuration - set via environment variables on Cloud Functions
// Use Secret Manager: firebase functions:secrets:set GOOGLE_CLIENT_ID, etc.
// Note: FIREBASE_API_KEY is a reserved prefix, so we use PAIRIT_FIREBASE_API_KEY instead
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? '';
const FIREBASE_API_KEY = process.env.PAIRIT_FIREBASE_API_KEY ?? '';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FIREBASE_AUTH_URL = 'https://identitytoolkit.googleapis.com/v1';

// Valid redirect port range for CLI callback server
const MIN_REDIRECT_PORT = 9000;
const MAX_REDIRECT_PORT = 9010;

// Session storage (in-memory, short-lived)
// In production, consider using Firestore for distributed state
interface BaseSession {
  cliRedirectPort: number;
  cliState: string;
  createdAt: number;
}

interface OAuthSession extends BaseSession {
  type: 'oauth';
  codeVerifier: string;
}

interface EmailSession extends BaseSession {
  type: 'email';
  email: string;
}

type AuthSession = OAuthSession | EmailSession;

const authSessions = new Map<string, AuthSession>();

// Clean up expired sessions (5 minute timeout)
const SESSION_TIMEOUT_MS = 5 * 60 * 1000;

function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [key, session] of authSessions.entries()) {
    if (now - session.createdAt > SESSION_TIMEOUT_MS) {
      authSessions.delete(key);
    }
  }
}

// PKCE helpers
function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

function generateStateToken(): string {
  return randomBytes(16).toString('base64url');
}

// Validate redirect port
function isValidRedirectPort(port: number): boolean {
  return Number.isInteger(port) && port >= MIN_REDIRECT_PORT && port <= MAX_REDIRECT_PORT;
}

// Validate email format
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export const cliAuthApp = new Hono();

/**
 * GET /auth/login
 * 
 * Shows login page for CLI authentication with both Google and Email options.
 * Query params:
 *   - redirect_port: Port where CLI callback server is listening (9000-9010)
 *   - state: State token from CLI for CSRF protection
 *   - provider: Optional, 'google' or 'email' to skip the choice page
 */
cliAuthApp.get('/auth/login', async (c) => {
  const redirectPortStr = c.req.query('redirect_port');
  const cliState = c.req.query('state');
  const provider = c.req.query('provider');

  // Validate required params
  if (!redirectPortStr || !cliState) {
    return c.html(renderErrorPage('Missing required parameters. Please run "pairit auth login" from the CLI.'));
  }

  const redirectPort = parseInt(redirectPortStr, 10);
  if (!isValidRedirectPort(redirectPort)) {
    return c.html(renderErrorPage(`Invalid redirect port. Must be between ${MIN_REDIRECT_PORT} and ${MAX_REDIRECT_PORT}.`));
  }

  // Check server configuration
  if (!FIREBASE_API_KEY) {
    console.error('Missing FIREBASE_API_KEY');
    return c.html(renderErrorPage('Server is not configured for authentication. Please contact the administrator.'));
  }

  // If provider specified, redirect to that flow
  if (provider === 'google') {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return c.html(renderErrorPage('Server is not configured for Google OAuth. Please contact the administrator.'));
    }
    return initiateGoogleOAuth(c, redirectPort, cliState);
  }

  // Show login page with both options
  return c.html(renderLoginPage(redirectPort, cliState, !!GOOGLE_CLIENT_ID));
});

/**
 * Initiate Google OAuth flow
 */
async function initiateGoogleOAuth(c: any, redirectPort: number, cliState: string) {
  // Generate OAuth state and PKCE
  const serverState = generateStateToken();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  // Store session for callback
  cleanupExpiredSessions();
  authSessions.set(serverState, {
    type: 'oauth',
    cliRedirectPort: redirectPort,
    cliState,
    codeVerifier,
    createdAt: Date.now(),
  });

  // Build callback URL (this server's callback endpoint)
  const callbackUrl = new URL(c.req.url);
  callbackUrl.pathname = '/auth/google/callback';
  callbackUrl.search = '';

  // Build Google OAuth URL
  const oauthParams = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: callbackUrl.toString(),
    response_type: 'code',
    scope: 'openid email profile',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state: serverState,
    access_type: 'offline',
    prompt: 'consent',
  });

  const googleOAuthUrl = `${GOOGLE_AUTH_URL}?${oauthParams.toString()}`;
  return c.redirect(googleOAuthUrl);
}

/**
 * GET /auth/google/callback
 * 
 * Google OAuth callback. Exchanges code for tokens and redirects to CLI.
 */
cliAuthApp.get('/auth/google/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const error = c.req.query('error');

  // Handle OAuth errors
  if (error) {
    return c.html(renderErrorPage(`Google authentication failed: ${error}`));
  }

  if (!code || !state) {
    return c.html(renderErrorPage('Missing code or state parameter from Google.'));
  }

  // Retrieve and validate session
  const session = authSessions.get(state);
  if (!session || session.type !== 'oauth') {
    return c.html(renderErrorPage('Invalid or expired session. Please try again.'));
  }

  // Remove session (one-time use)
  authSessions.delete(state);

  // Check session expiry
  if (Date.now() - session.createdAt > SESSION_TIMEOUT_MS) {
    return c.html(renderErrorPage('Session expired. Please try again.'));
  }

  try {
    // Build callback URL for token exchange
    const callbackUrl = new URL(c.req.url);
    callbackUrl.pathname = '/auth/google/callback';
    callbackUrl.search = '';

    // Exchange Google authorization code for tokens
    const googleTokens = await exchangeGoogleCode(
      code,
      session.codeVerifier,
      callbackUrl.toString()
    );

    // Exchange Google ID token for Firebase ID token
    const firebaseTokens = await exchangeGoogleTokenForFirebase(googleTokens.idToken);

    // Redirect to CLI with tokens
    return redirectToCli(c, session.cliRedirectPort, session.cliState, firebaseTokens, 'google');
  } catch (err) {
    console.error('OAuth callback error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.html(renderErrorPage(`Authentication failed: ${message}`));
  }
});

/**
 * POST /auth/email/send
 * 
 * Send sign-in email link. Called from the login page form.
 */
cliAuthApp.post('/auth/email/send', async (c) => {
  const body = await c.req.parseBody();
  const email = body.email as string;
  const redirectPortStr = body.redirect_port as string;
  const cliState = body.state as string;

  // Validate inputs
  if (!email || !isValidEmail(email)) {
    return c.html(renderEmailSentPage(false, 'Please enter a valid email address.', redirectPortStr, cliState));
  }

  const redirectPort = parseInt(redirectPortStr, 10);
  if (!isValidRedirectPort(redirectPort)) {
    return c.html(renderErrorPage('Invalid redirect port.'));
  }

  if (!cliState) {
    return c.html(renderErrorPage('Missing state parameter.'));
  }

  // Generate session state for email callback
  const serverState = generateStateToken();

  // Store session for callback
  cleanupExpiredSessions();
  authSessions.set(serverState, {
    type: 'email',
    cliRedirectPort: redirectPort,
    cliState,
    email,
    createdAt: Date.now(),
  });

  // Build email callback URL (this server's callback endpoint)
  const callbackUrl = new URL(c.req.url);
  callbackUrl.pathname = '/auth/email/callback';
  callbackUrl.search = '';
  callbackUrl.searchParams.set('session', serverState);

  try {
    // Send sign-in email via Firebase REST API
    await sendSignInLink(email, callbackUrl.toString());
    return c.html(renderEmailSentPage(true, email, redirectPortStr, cliState));
  } catch (err) {
    console.error('Send email error:', err);
    const message = err instanceof Error ? err.message : 'Failed to send email';
    return c.html(renderEmailSentPage(false, message, redirectPortStr, cliState));
  }
});

/**
 * GET /auth/email/callback
 * 
 * Email link callback. Receives oobCode from Firebase, exchanges for tokens, redirects to CLI.
 */
cliAuthApp.get('/auth/email/callback', async (c) => {
  const oobCode = c.req.query('oobCode');
  const sessionId = c.req.query('session');

  if (!oobCode) {
    return c.html(renderErrorPage('Invalid email link. Please request a new sign-in link.'));
  }

  if (!sessionId) {
    return c.html(renderErrorPage('Invalid session. Please try again from the CLI.'));
  }

  // Retrieve and validate session
  const session = authSessions.get(sessionId);
  if (!session || session.type !== 'email') {
    return c.html(renderErrorPage('Invalid or expired session. Please try again.'));
  }

  // Remove session (one-time use)
  authSessions.delete(sessionId);

  // Check session expiry
  if (Date.now() - session.createdAt > SESSION_TIMEOUT_MS) {
    return c.html(renderErrorPage('Session expired. Please try again.'));
  }

  try {
    // Exchange oobCode for Firebase tokens
    const firebaseTokens = await signInWithEmailLink(session.email, oobCode);

    // Redirect to CLI with tokens
    return redirectToCli(c, session.cliRedirectPort, session.cliState, firebaseTokens, 'email');
  } catch (err) {
    console.error('Email callback error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.html(renderErrorPage(`Authentication failed: ${message}`));
  }
});

/**
 * Redirect to CLI callback with tokens
 */
function redirectToCli(
  c: any,
  port: number,
  state: string,
  tokens: { idToken: string; refreshToken: string; expiresIn: number; uid: string; email?: string },
  provider: 'google' | 'email'
) {
  const cliRedirectUrl = new URL(`http://127.0.0.1:${port}/oauth2callback`);
  cliRedirectUrl.searchParams.set('state', state);
  cliRedirectUrl.searchParams.set('id_token', tokens.idToken);
  cliRedirectUrl.searchParams.set('refresh_token', tokens.refreshToken);
  cliRedirectUrl.searchParams.set('expires_in', tokens.expiresIn.toString());
  cliRedirectUrl.searchParams.set('uid', tokens.uid);
  cliRedirectUrl.searchParams.set('provider', provider);
  if (tokens.email) {
    cliRedirectUrl.searchParams.set('email', tokens.email);
  }

  return c.redirect(cliRedirectUrl.toString());
}

/**
 * Exchange Google authorization code for tokens
 */
async function exchangeGoogleCode(
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<{ idToken: string; accessToken: string; refreshToken?: string }> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      code,
      code_verifier: codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }).toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Google token exchange failed:', errorText);
    throw new Error('Failed to exchange authorization code');
  }

  const data = await response.json() as {
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
 */
async function exchangeGoogleTokenForFirebase(
  googleIdToken: string
): Promise<{ idToken: string; refreshToken: string; expiresIn: number; uid: string; email?: string }> {
  const response = await fetch(`${FIREBASE_AUTH_URL}/accounts:signInWithIdp?key=${FIREBASE_API_KEY}`, {
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
    const error = await response.json() as { error?: { message?: string } };
    console.error('Firebase token exchange failed:', error);
    throw new Error(error.error?.message ?? 'Failed to exchange Google token for Firebase token');
  }

  const data = await response.json() as {
    idToken: string;
    refreshToken: string;
    expiresIn: string;
    localId: string;
    email?: string;
  };

  return {
    idToken: data.idToken,
    refreshToken: data.refreshToken,
    expiresIn: parseInt(data.expiresIn, 10),
    uid: data.localId,
    email: data.email,
  };
}

/**
 * Send sign-in email link via Firebase REST API
 */
async function sendSignInLink(email: string, continueUrl: string): Promise<void> {
  const response = await fetch(`${FIREBASE_AUTH_URL}/accounts:sendOobCode?key=${FIREBASE_API_KEY}`, {
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
    const error = await response.json() as { error?: { message?: string } };
    const errorMessage = error.error?.message ?? 'Failed to send sign-in email';
    
    if (errorMessage === 'EMAIL_NOT_FOUND') {
      throw new Error('Email address not found. Please check the email and try again.');
    }
    if (errorMessage === 'OPERATION_NOT_ALLOWED') {
      throw new Error('Email link sign-in is not enabled. Please contact the administrator.');
    }
    
    throw new Error(errorMessage);
  }
}

/**
 * Complete sign-in with email link oobCode
 */
async function signInWithEmailLink(
  email: string,
  oobCode: string
): Promise<{ idToken: string; refreshToken: string; expiresIn: number; uid: string; email?: string }> {
  const response = await fetch(`${FIREBASE_AUTH_URL}/accounts:signInWithEmailLink?key=${FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      oobCode,
    }),
  });

  if (!response.ok) {
    const error = await response.json() as { error?: { message?: string } };
    throw new Error(error.error?.message ?? 'Email link sign-in failed');
  }

  const data = await response.json() as {
    idToken: string;
    refreshToken: string;
    expiresIn: string;
    localId: string;
    email: string;
  };

  return {
    idToken: data.idToken,
    refreshToken: data.refreshToken,
    expiresIn: parseInt(data.expiresIn, 10),
    uid: data.localId,
    email: data.email,
  };
}

// ============================================================================
// HTML Templates
// ============================================================================

const PAGE_STYLES = `
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
    color: #e4e4e7;
  }
  .container {
    text-align: center;
    padding: 3rem;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 1rem;
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    max-width: 420px;
    width: 90%;
  }
  .logo {
    font-size: 2.5rem;
    font-weight: 700;
    margin-bottom: 0.5rem;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  .subtitle {
    color: #a1a1aa;
    margin-bottom: 2rem;
  }
  .divider {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin: 1.5rem 0;
    color: #71717a;
    font-size: 0.875rem;
  }
  .divider::before, .divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: rgba(255, 255, 255, 0.1);
  }
  .google-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    width: 100%;
    padding: 0.875rem 1.5rem;
    background: #fff;
    color: #374151;
    border: none;
    border-radius: 0.5rem;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    text-decoration: none;
    transition: transform 0.15s, box-shadow 0.15s;
  }
  .google-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 20px rgba(0, 0, 0, 0.2);
  }
  .google-btn svg {
    width: 20px;
    height: 20px;
  }
  .email-form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .email-input {
    width: 100%;
    padding: 0.875rem 1rem;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 0.5rem;
    color: #e4e4e7;
    font-size: 1rem;
    outline: none;
    transition: border-color 0.15s;
  }
  .email-input:focus {
    border-color: #667eea;
  }
  .email-input::placeholder {
    color: #71717a;
  }
  .email-btn {
    width: 100%;
    padding: 0.875rem 1.5rem;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: #fff;
    border: none;
    border-radius: 0.5rem;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    transition: transform 0.15s, box-shadow 0.15s;
  }
  .email-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3);
  }
  .footer {
    margin-top: 2rem;
    font-size: 0.875rem;
    color: #71717a;
  }
  .success-icon {
    font-size: 4rem;
    margin-bottom: 1rem;
  }
  .error-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
  }
  h1 {
    font-size: 1.5rem;
    margin-bottom: 1rem;
  }
  h1.error {
    color: #f87171;
  }
  h1.success {
    color: #4ade80;
  }
  .message {
    color: #a1a1aa;
    margin-bottom: 1.5rem;
    line-height: 1.6;
  }
  .hint {
    font-size: 0.875rem;
    color: #71717a;
    padding: 1rem;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 0.5rem;
  }
  code {
    background: rgba(255, 255, 255, 0.1);
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    font-size: 0.875rem;
  }
  .back-link {
    display: inline-block;
    margin-top: 1rem;
    color: #667eea;
    text-decoration: none;
    font-size: 0.875rem;
  }
  .back-link:hover {
    text-decoration: underline;
  }
`;

const GOOGLE_ICON = `<svg viewBox="0 0 24 24">
  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
</svg>`;

/**
 * Render login page HTML with both Google and Email options
 */
function renderLoginPage(redirectPort: number, cliState: string, hasGoogleOAuth: boolean) {
  const googleAuthUrl = `/auth/login?redirect_port=${redirectPort}&state=${encodeURIComponent(cliState)}&provider=google`;
  
  return html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign in to Pairit</title>
  <style>${PAGE_STYLES}</style>
</head>
<body>
  <div class="container">
    <div class="logo">Pairit</div>
    <p class="subtitle">Sign in to continue to CLI</p>
    
    ${hasGoogleOAuth ? html`
    <a href="${googleAuthUrl}" class="google-btn">
      ${html([GOOGLE_ICON])}
      Sign in with Google
    </a>
    <div class="divider">or</div>
    ` : ''}
    
    <form class="email-form" action="/auth/email/send" method="POST">
      <input type="hidden" name="redirect_port" value="${redirectPort}">
      <input type="hidden" name="state" value="${cliState}">
      <input 
        type="email" 
        name="email" 
        class="email-input" 
        placeholder="Enter your email"
        required
        autocomplete="email"
      >
      <button type="submit" class="email-btn">
        Continue with Email
      </button>
    </form>
    
    <p class="footer">You will be redirected back to the CLI after signing in.</p>
  </div>
</body>
</html>`;
}

/**
 * Render email sent confirmation page
 */
function renderEmailSentPage(success: boolean, messageOrEmail: string, redirectPort: string, cliState: string) {
  if (success) {
    return html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Check your email - Pairit</title>
  <style>${PAGE_STYLES}</style>
</head>
<body>
  <div class="container">
    <div class="success-icon">📧</div>
    <h1 class="success">Check your email</h1>
    <p class="message">
      We sent a sign-in link to<br>
      <strong>${messageOrEmail}</strong>
    </p>
    <div class="hint">
      Click the link in the email to complete sign-in.<br>
      If you don't see it, check your spam folder.
    </div>
    <a href="/auth/login?redirect_port=${redirectPort}&state=${encodeURIComponent(cliState)}" class="back-link">
      ← Use a different email
    </a>
  </div>
</body>
</html>`;
  } else {
    return html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Error - Pairit</title>
  <style>${PAGE_STYLES}</style>
</head>
<body>
  <div class="container">
    <div class="error-icon">⚠️</div>
    <h1 class="error">Could not send email</h1>
    <p class="message">${messageOrEmail}</p>
    <a href="/auth/login?redirect_port=${redirectPort}&state=${encodeURIComponent(cliState)}" class="back-link">
      ← Try again
    </a>
  </div>
</body>
</html>`;
  }
}

/**
 * Render error page HTML
 */
function renderErrorPage(message: string) {
  return html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authentication Error - Pairit</title>
  <style>${PAGE_STYLES}</style>
</head>
<body>
  <div class="container">
    <div class="error-icon">⚠️</div>
    <h1 class="error">Authentication Failed</h1>
    <p class="message">${message}</p>
    <div class="hint">
      Try running <code>pairit auth login</code> again from your terminal.
    </div>
  </div>
</body>
</html>`;
}
