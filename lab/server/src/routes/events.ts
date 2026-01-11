/**
 * Event logging routes for lab server
 * POST /sessions/:id/events - Log user interaction events
 *
 * Security Model (Qualtrics-style):
 * - Session UUID serves as authorization (128-bit, cryptographically secure)
 * - Only someone who started the session knows the UUID
 * - No additional auth check needed beyond session existence
 */
import { Elysia, t } from 'elysia';
import { getEventsCollection, getSessionsCollection } from '../lib/db';
import type { EventDocument } from '../types';

export const eventsRoutes = new Elysia()
    .post('/sessions/:id/events', async ({ params: { id: sessionId }, body, set }) => {
        // Session existence = authorization (Qualtrics model)
        // The cryptographic UUID prevents enumeration/guessing
        const sessionsCollection = await getSessionsCollection();
        const session = await sessionsCollection.findOne({ id: sessionId });
        if (!session) {
            set.status = 404;
            return { error: 'session_not_found' };
        }

        const event: EventDocument = {
            type: body.type,
            timestamp: body.timestamp,
            sessionId,
            configId: session.configId,
            pageId: session.currentPageId,
            componentType: body.componentType,
            componentId: body.componentId,
            data: body.data,
            createdAt: new Date(),
        };

        const eventsCollection = await getEventsCollection();
        const result = await eventsCollection.insertOne(event as any);
        return { eventId: result.insertedId.toString() };
    }, {
        params: t.Object({
            id: t.String()
        }),
        body: t.Object({
            type: t.String({ minLength: 1 }),
            timestamp: t.String(),
            componentType: t.String({ minLength: 1 }),
            componentId: t.String({ minLength: 1 }),
            data: t.Record(t.String(), t.Unknown())
        })
    });
