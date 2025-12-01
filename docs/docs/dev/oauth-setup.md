# OAuth Setup Guide

This guide helps you set up Google Sign-In OAuth authentication with production Firebase.

## Prerequisites

1. Firebase project created (e.g., `pairit-lab`)
2. Google Sign-In provider enabled in Firebase Console
3. Google OAuth Client ID created in Google Cloud Console

## Google Cloud Console Configuration

### 1. Create OAuth Client ID (Required)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (same project as Firebase, e.g., `pairit-lab`)
3. Navigate to **APIs & Services** > **Credentials**
4. Click **+ CREATE CREDENTIALS** > **OAuth client ID**
5. Select **Application type**: **Desktop app**
6. Name it (e.g., "Pairit CLI")
7. Click **Create**
8. Copy the **Client ID** (looks like `123456789-xxxx.apps.googleusercontent.com`)

### 2. Configure OAuth Consent Screen

If prompted, configure the OAuth consent screen:
1. Go to **APIs & Services** > **OAuth consent screen**
2. Select **External** (or Internal for Google Workspace)
3. Fill in required fields:
   - App name: "Pairit CLI"
   - User support email: your email
   - Developer contact: your email
4. Add scopes: `openid`, `email`, `profile`
5. Save

## Firebase Console Configuration

### 1. Enable Google Sign-In Provider

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project (`pairit-lab`)
3. Navigate to **Authentication** > **Sign-in method**
4. Click on **Google** provider
5. Enable it and configure:
   - Project support email
   - Project public-facing name
6. Save

### 2. Get Your Firebase API Key

1. Go to **Project Settings** > **General**
2. Scroll to **Your apps** section
3. Find your web app or create one
4. Copy the **API Key** (starts with `AIza...`)

## CLI Environment Setup

### Required Environment Variables

```bash
# Unset emulator variables (if they were set)
unset USE_FIREBASE_EMULATOR
unset FIREBASE_AUTH_EMULATOR_HOST

# Set Google OAuth Client ID (from Google Cloud Console)
export GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"

# Set Firebase API key (from Firebase Console)
export FIREBASE_API_KEY="AIzaSyB6iyKyV8btwk4wQVMGqqSi7IN7vB0zk3c"
```

### Create `.env` File (Recommended)

Create a `.env` file in the project root:

```bash
# Google OAuth Configuration (from Google Cloud Console)
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com

# Firebase Configuration (from Firebase Console)
FIREBASE_API_KEY=firbase-app-api-key

# Make sure these are NOT set for production OAuth
# USE_FIREBASE_EMULATOR=
# FIREBASE_AUTH_EMULATOR_HOST=
```

Then source it:
```bash
source .env
```

**Note:** Add `.env` to `.gitignore` to avoid committing credentials.

## Testing OAuth Login

### 1. Build CLI

```bash
pnpm --filter pairit-cli build
```

### 2. Run OAuth Login

```bash
# From manager/cli directory (recommended)
cd manager/cli && node dist/index.js auth login --provider google

# Or use pnpm exec with node directly
pnpm --filter pairit-cli exec node dist/index.js auth login --provider google
```

### 3. Complete OAuth Flow

1. Browser should open automatically
2. Sign in with your Google account
3. Authorize the application
4. Browser redirects to `http://localhost:9000/oauth2callback`
5. CLI receives authorization code and exchanges it for tokens
6. Token stored with `provider: 'google'`

### 4. Verify Authentication

```bash
pnpm --filter pairit-cli exec pairit auth status
```

Should show:
```
✓ Authenticated as your-email@gmail.com
```

### 5. Test API Calls

```bash
pnpm --filter pairit-cli exec pairit config list
```

## Troubleshooting

### "OAuth authentication is not supported with Firebase Auth emulator"

**Solution:** Make sure emulator variables are unset:
```bash
unset USE_FIREBASE_EMULATOR
unset FIREBASE_AUTH_EMULATOR_HOST
```

### "The requested action is invalid"

**Possible causes:**
1. Google Sign-In not enabled in Firebase Console
2. `localhost` not in authorized domains
3. API key restrictions in Google Cloud Console

**Solutions:**
1. Enable Google Sign-In in Firebase Console (Authentication > Sign-in method)
2. Add `localhost` to authorized domains (Authentication > Settings > Authorized domains)
3. Check Google Cloud Console > APIs & Services > Credentials > Your API Key > Key restrictions

### "Cannot find package 'open'"

**Solution:** Install dependencies and rebuild:
```bash
pnpm --filter pairit-cli install
pnpm --filter pairit-cli build
```

### Browser Doesn't Open

The CLI will print the OAuth URL. Copy and paste it into your browser manually.

## Switching Between Email and OAuth

You can switch between authentication methods:

```bash
# Email/password (works with emulator)
export USE_FIREBASE_EMULATOR=true
export FIREBASE_API_KEY=fake-api-key
pnpm --filter pairit-cli exec pairit auth login --provider email

# OAuth (requires production)
unset USE_FIREBASE_EMULATOR
export FIREBASE_API_KEY=your-production-api-key
pnpm --filter pairit-cli exec pairit auth login --provider google
```

Both methods produce tokens that work identically for API calls.

## Security Notes

- **Never commit API keys** to version control
- Use environment variables or `.env` files (add to `.gitignore`)
- API keys are safe to expose in client-side code (they're public)
- For server-side use, consider using Firebase Admin SDK with service accounts
- Tokens are stored securely in `~/.config/pairit/auth.json` with mode `0600`

