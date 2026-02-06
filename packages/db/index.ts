/**
 * Shared MongoDB Connection Module
 * Provides a singleton MongoClient for all services to share
 */
import { MongoClient, Db, type MongoClientOptions } from 'mongodb';

const IS_DEV = process.env.NODE_ENV === 'development';
const DEV_MONGODB_URI = 'mongodb://localhost:27017/pairit';

let client: MongoClient | null = null;
let db: Db | null = null;
let connectionPromise: Promise<Db> | null = null;

/**
 * Get the MongoDB URI from environment or use development default
 */
function getMongoUri(): string {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        if (IS_DEV) {
            console.warn('[DB] MONGODB_URI not set, using development default');
            return DEV_MONGODB_URI;
        }
        throw new Error('MONGODB_URI environment variable is required in production');
    }
    return uri;
}

/**
 * Build MongoDB client options with appropriate TLS settings
 */
function buildClientOptions(): MongoClientOptions {
    const options: MongoClientOptions = {
        // Timeouts - fail fast instead of hanging
        connectTimeoutMS: 5000,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 30000,
    };

    if (IS_DEV) {
        // Workaround for Bun TLS "subject" destructuring error in development only
        // This bypasses certificate validation - NEVER use in production
        // TODO: Remove when Bun fixes this issue
        (options as any).checkServerIdentity = () => undefined;
        console.warn('[DB] TLS certificate validation disabled (development mode)');
    }

    return options;
}

/**
 * Connect to MongoDB and return the database instance
 * Uses singleton pattern - subsequent calls return the same connection
 */
export async function connectDB(): Promise<Db> {
    // Return existing connection if available
    if (db) return db;

    // Return existing connection attempt if in progress
    if (connectionPromise) return connectionPromise;

    // Start new connection
    connectionPromise = (async () => {
        const uri = getMongoUri();
        const options = buildClientOptions();

        if (!client) {
            client = new MongoClient(uri, options);
        }
        await client.connect();

        // Extract database name from URI or use default
        const dbName = new URL(uri).pathname.slice(1) || 'pairit';
        db = client.db(dbName);

        console.log(`[DB] Connected to MongoDB: ${dbName}`);
        return db;
    })();

    try {
        return await connectionPromise;
    } catch (error) {
        // Reset state on connection failure
        connectionPromise = null;
        client = null;
        db = null;
        throw error;
    }
}

/**
 * Get the raw MongoClient instance
 * Useful for libraries that need the client directly (e.g., Better Auth adapter)
 */
export function getClient(): MongoClient {
    if (!client) {
        const uri = getMongoUri();
        const options = buildClientOptions();
        client = new MongoClient(uri, options);
    }
    return client;
}

/**
 * Get the database name from the connection URI
 */
export function getDbName(): string {
    const uri = getMongoUri();
    return new URL(uri).pathname.slice(1) || 'pairit';
}

/**
 * Close the MongoDB connection
 */
export async function closeDB(): Promise<void> {
    if (client) {
        await client.close();
        client = null;
        db = null;
        connectionPromise = null;
        console.log('[DB] MongoDB connection closed');
    }
}

/**
 * Check if connected to MongoDB
 */
export function isConnected(): boolean {
    return db !== null;
}

// Register graceful shutdown handlers
process.on('SIGTERM', async () => {
    await closeDB();
    process.exit(0);
});

process.on('SIGINT', async () => {
    await closeDB();
    process.exit(0);
});
