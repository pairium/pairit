import { auth } from '@pairit/auth';

export async function getAuthenticatedUser(request: Request) {
    const sessionData = await auth.api.getSession({ headers: request.headers });
    return sessionData?.user || null;
}
