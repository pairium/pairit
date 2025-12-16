/**
 * Auth middleware for manager server
 * Validates Better Auth session on all protected routes
 */
import { Elysia } from 'elysia';
import { auth } from '../../../../lib/auth';
import type { User, Session } from '../../../../lib/auth';

export const authMiddleware = (app: Elysia) => app
    .derive(async ({ request }): Promise<{
        user: User | null;
        session: Session | null;
    }> => {
        // Extract session from request
        const sessionData = await auth.api.getSession({ headers: request.headers });

        // Note: We don't throw here to allow optional auth routes to handle it
        // The route handler checks for user existence
        return {
            user: sessionData?.user || null,
            session: sessionData?.session || null,
        };
    });
