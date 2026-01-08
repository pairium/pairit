/**
 * Optional auth middleware for lab server
 * Validates session token OR Better Auth session based on config requirements
 */
import { Elysia } from 'elysia';
import { auth } from '../../../../lib/auth';
import { getConfigsCollection, getSessionsCollection } from '../lib/db';
import type { User } from '../../../../lib/auth';

export const optionalAuthMiddleware = new Elysia({ name: 'optional-auth-middleware' })
    .derive(async ({ request, params }): Promise<{
        requireAuth: boolean;
        user: User | null;
        sessionId?: string;
    }> => {
        // Extract configId from params or body
        const url = new URL(request.url);
        const sessionId = params.id as string | undefined;

        // If we have a session ID, get the config from the session
        let configId: string | undefined;
        if (sessionId) {
            const sessionsCollection = await getSessionsCollection();
            const sessionDoc = await sessionsCollection.findOne({ id: sessionId });
            configId = sessionDoc?.configId;
        } else if (request.method === 'POST' && url.pathname.endsWith('/sessions/start')) {
            // Try to look for configId in body (only for /sessions/start)
            try {
                const cloned = request.clone();
                const body = await cloned.json();
                if (body && typeof body === 'object' && 'configId' in body) {
                    configId = body.configId;
                }
            } catch (e) {
                // Ignore body parsing errors (might not be JSON)
            }
        }

        // Check config requireAuth setting
        if (configId) {
            const configsCollection = await getConfigsCollection();
            const config = await configsCollection.findOne({ configId });
            const requireAuth = config?.requireAuth ?? true;

            if (!requireAuth) {
                // Check for session token in query params
                const sessionToken = url.searchParams.get('token');

                if (sessionToken && sessionId) {
                    const sessionsCollection = await getSessionsCollection();
                    const session = await sessionsCollection.findOne({
                        id: sessionId,
                        sessionToken,
                    });

                    if (session) {
                        // Valid session token - no auth required
                        return {
                            requireAuth: false,
                            user: null,
                            sessionId: session.id,
                        };
                    }
                }
            }
        }

        // Fallback to regular auth (required)
        const sessionData = await auth.api.getSession({ headers: request.headers });

        if (!sessionData) {
            throw new Error('Unauthorized');
        }

        return {
            requireAuth: true,
            user: sessionData.user,
        };
    });
