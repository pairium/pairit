/**
 * MongoDB connection and collection helpers
 */
import { MongoClient, Db, Collection } from 'mongodb';
import type { ConfigDocument, SessionDocument, EventDocument } from '../types';

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connectDB(): Promise<Db> {
    if (db) return db;

    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/pairit';
    client = new MongoClient(uri);
    await client.connect();

    // Extract database name from URI or use default
    const dbName = new URL(uri).pathname.slice(1) || 'pairit';
    db = client.db(dbName);

    console.log(`Connected to MongoDB: ${dbName}`);
    return db;
}

export async function getConfigsCollection(): Promise<Collection<ConfigDocument>> {
    const database = await connectDB();
    return database.collection<ConfigDocument>('configs');
}

export async function getSessionsCollection(): Promise<Collection<SessionDocument>> {
    const database = await connectDB();
    return database.collection<SessionDocument>('sessions');
}

export async function getEventsCollection(): Promise<Collection<EventDocument>> {
    const database = await connectDB();
    return database.collection<EventDocument>('events');
}

export async function closeDB(): Promise<void> {
    if (client) {
        await client.close();
        client = null;
        db = null;
    }
}
