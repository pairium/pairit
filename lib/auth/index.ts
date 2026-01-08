/**
 * Shared Better Auth configuration
 * Provides authentication with Google OAuth and MongoDB storage
 */
import { betterAuth } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { MongoClient, type MongoClientOptions } from 'mongodb';

const IS_DEV = process.env.NODE_ENV === 'development';
const DEV_MONGODB_URI = 'mongodb://localhost:27017/pairit';
const DEV_AUTH_SECRET = 'development-secret-do-not-use-in-production-32chars';

// Validate required environment variables in production
function getMongoUri(): string {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        if (IS_DEV) {
            console.warn('[Auth] MONGODB_URI not set, using development default');
            return DEV_MONGODB_URI;
        }
        throw new Error('MONGODB_URI environment variable is required in production');
    }
    return uri;
}

function getAuthSecret(): string {
    const secret = process.env.AUTH_SECRET;
    if (!secret) {
        if (IS_DEV) {
            console.warn('[Auth] AUTH_SECRET not set, using insecure development default');
            return DEV_AUTH_SECRET;
        }
        throw new Error('AUTH_SECRET environment variable is required in production');
    }
    if (secret.length < 32) {
        if (IS_DEV) {
            console.warn('[Auth] AUTH_SECRET is less than 32 characters, this is insecure');
            return secret.padEnd(32, '0');
        }
        throw new Error('AUTH_SECRET must be at least 32 characters in production');
    }
    return secret;
}

const uri = getMongoUri();
const finalSecret = getAuthSecret();

// Configure MongoDB client options
// Note: checkServerIdentity bypass is only for development due to Bun TLS issues
const mongoOptions: MongoClientOptions = {};
if (IS_DEV) {
    // Workaround for Bun TLS "subject" destructuring error in development only
    // TODO: Remove when Bun fixes this issue
    (mongoOptions as any).checkServerIdentity = () => undefined;
}

const client = new MongoClient(uri, mongoOptions);

// Ensure the client is connected
client.connect().then(() => {
    console.log('[Auth] Successfully connected to MongoDB');
}).catch(err => {
    console.error('[Auth] Failed to connect to MongoDB:', err);
    if (!IS_DEV) {
        process.exit(1); // Exit in production if DB connection fails
    }
});

// Extract database name from URI
console.log('[Auth] Initializing with baseURL:', process.env.AUTH_BASE_URL);
const dbName = new URL(uri).pathname.slice(1) || 'pairit';

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
