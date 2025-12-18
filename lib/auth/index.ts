/**
 * Shared Better Auth configuration
 * Provides authentication with Google OAuth and MongoDB storage
 */
import { betterAuth } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { MongoClient } from 'mongodb';

// Create MongoDB client for Better Auth
const uri = process.env.MONGODB_URI || 'mongodb://READ_ENV_FAILED_AUTH:27017/pairit';
const client = new MongoClient(uri, {
    // @ts-ignore - Workaround for Bun TLS "subject" destructuring error
    checkServerIdentity: () => undefined
});

// Ensure the client is connected
client.connect().then(() => {
    console.log('[Auth] Successfully connected to MongoDB');
}).catch(err => {
    console.error('[Auth] Failed to connect to MongoDB:', err);
});

// Extract database name from URI
console.log('[Auth] Initializing with baseURL:', process.env.AUTH_BASE_URL);
const dbName = new URL(uri).pathname.slice(1) || 'pairit';

const authSecret = process.env.AUTH_SECRET || 'development-secret-change-in-production-long-enough';
// Ensure secret is long enough (32+ chars)
const finalSecret = authSecret.length < 32 ? authSecret.padEnd(32, '0') : authSecret;

export const auth = betterAuth({
    database: mongodbAdapter(client.db(dbName)),
    baseURL: process.env.AUTH_BASE_URL ? new URL(process.env.AUTH_BASE_URL).origin : 'http://localhost:3001',
    basePath: '/api/auth',
    secret: finalSecret,
    trustedOrigins: [
        ...(process.env.AUTH_TRUSTED_ORIGINS ? process.env.AUTH_TRUSTED_ORIGINS.split(',') : []),
        process.env.AUTH_BASE_URL ? new URL(process.env.AUTH_BASE_URL).origin : 'http://localhost:3001'
    ],

    // Enable email/password authentication
    emailAndPassword: {
        enabled: true,
        // Require email verification before allowing login
        requireEmailVerification: false,
    },

    // Configure Google OAuth
    socialProviders: {
        google: {
            clientId: process.env.GOOGLE_CLIENT_ID || '',
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
            // Request email scope explicitly
            scope: ['email', 'profile', 'openid'],
        },
    },

    // Session management
    session: {
        expiresIn: 60 * 60 * 24 * 7, // 7 days
        updateAge: 60 * 60 * 24, // Update session every 24 hours
        cookieCache: {
            enabled: true,
            maxAge: 5 * 60, // Cache for 5 minutes
        },
    },
});

export type { User, Session, AuthContext } from './types';
