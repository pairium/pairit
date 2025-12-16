/**
 * Shared Better Auth configuration
 * Provides authentication with Google OAuth and MongoDB storage
 */
import { betterAuth } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { MongoClient } from 'mongodb';

// Create MongoDB client for Better Auth
const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/pairit';
const client = new MongoClient(uri);

// Extract database name from URI
const dbName = new URL(uri).pathname.slice(1) || 'pairit';

export const auth = betterAuth({
    database: mongodbAdapter(client.db(dbName)),
    baseURL: process.env.AUTH_BASE_URL || 'http://localhost:3001',
    secret: process.env.AUTH_SECRET || 'development-secret-change-in-production',

    // Enable email/password authentication
    emailAndPassword: {
        enabled: true,
        // Require email verification before allowing login
        requireEmailVerification: false, // Set to true in production with email provider
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
