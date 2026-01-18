/**
 * Auth middleware for lab server
 * Checks config requireAuth setting and validates Better Auth session when required
 *
 * Security Model (Qualtrics-style):
 * - requireAuth: false → Anyone can start sessions, session UUID = authorization
 * - requireAuth: true  → Must have valid Better Auth session to start
 */
import { Elysia } from 'elysia';
import { auth } from '../../../../lib/auth';
import { getConfigsCollection, getSessionsCollection } from '../lib/db';
import type { User } from '../../../../lib/auth';

/**
 * Context type added by the auth middleware
 */
export type AuthContext = {
    requireAuth: boolean;
    user: User | null;
};

/**
 * Derive function that can be used inline to get proper type inference
 */
export async function deriveAuthContext({ request, params }: {
    request: Request;
    params?: Record<string, string | undefined>;
}): Promise<AuthContext> {
    const url = new URL(request.url);
    const sessionId = params?.id as string | undefined;

    // Determine configId from session or request body
    let configId: string | undefined;
    if (sessionId) {
        const sessionsCollection = await getSessionsCollection();
        const sessionDoc = await sessionsCollection.findOne({ id: sessionId });
        configId = sessionDoc?.configId;
    } else if (request.method === 'POST' && url.pathname.endsWith('/sessions/start')) {
        try {
            const cloned = request.clone();
            const body = await cloned.json();
            if (body && typeof body === 'object' && 'configId' in body) {
                configId = body.configId;
            }
        } catch {
            // Ignore body parsing errors
        }
    }

    // Check config requireAuth setting
    if (configId) {
        const configsCollection = await getConfigsCollection();
        const config = await configsCollection.findOne({ configId });
        const requireAuth = config?.requireAuth ?? true;

        if (!requireAuth) {
            // Public config - allow anonymous access
            // Session UUID itself serves as authorization (Qualtrics model)
            return {
                requireAuth: false,
                user: null,
            };
        }
    }

    // Auth required - attempt Better Auth session lookup (optional for Qualtrics model)
    const sessionData = await auth.api.getSession({ headers: request.headers }).catch(() => null);

    return {
        requireAuth: true,
        user: sessionData?.user ?? null,
    };
}

/**
 * Elysia plugin that adds optional auth middleware
 * Uses derive to add auth context to all routes
 */
export const optionalAuthMiddleware = new Elysia({ name: 'optional-auth-middleware' })
    .derive(({ request, params }) => deriveAuthContext({ request, params }));
