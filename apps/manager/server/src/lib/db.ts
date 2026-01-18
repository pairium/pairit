/**
 * MongoDB connection for manager server
 * Uses shared @pairit/db module for singleton connection
 */
import { Collection } from 'mongodb';
import { connectDB } from '@pairit/db';
import type { ConfigDocument } from '../types';

export { connectDB, closeDB } from '@pairit/db';

export async function getConfigsCollection(): Promise<Collection<ConfigDocument>> {
    const database = await connectDB();
    return database.collection<ConfigDocument>('configs');
}
