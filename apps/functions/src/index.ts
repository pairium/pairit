import { Hono } from 'hono';
import { onRequest } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { advance, type Event as RuntimeEvent, type RunState } from '@pairit/runtime';

initializeApp();
const db = getFirestore();

const app = new Hono();

type SessionRequest = {
  publicId: string;
  participantId?: string;
};

type AdvanceRequest = {
  event: RuntimeEvent;
};

app.post('/sessions/start', async (c) => {
  const body = (await c.req.json()) as SessionRequest;
  if (!body.publicId) {
    return c.json({ error: 'publicId required' }, 400);
  }

  const sessionRef = db.collection('sessions').doc();
  await sessionRef.set({
    publicId: body.publicId,
    participantId: body.participantId ?? null,
    currentNodeId: 'intro',
    user_state: {},
    createdAt: Date.now(),
  });

  return c.json({ sessionId: sessionRef.id, firstNode: 'intro' });
});

app.get('/sessions/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId');
  const doc = await db.collection('sessions').doc(sessionId).get();
  if (!doc.exists) {
    return c.json({ error: 'not_found' }, 404);
  }

  const data = doc.data();
  return c.json({
    sessionId,
    currentNodeId: data?.currentNodeId,
    user_state: data?.user_state ?? {},
  });
});

app.post('/sessions/:sessionId/advance', async (c) => {
  const sessionId = c.req.param('sessionId');
  const body = (await c.req.json()) as AdvanceRequest;
  if (!body.event?.type) {
    return c.json({ error: 'event.type required' }, 400);
  }

  const sessionRef = db.collection('sessions').doc(sessionId);
  const doc = await sessionRef.get();
  if (!doc.exists) {
    return c.json({ error: 'not_found' }, 404);
  }

  const data = doc.data();
  const currentNodeId = data?.currentNodeId;
  if (typeof currentNodeId !== 'string') {
    return c.json({ error: 'invalid_state' }, 500);
  }

  const runState: RunState = { currentNodeId };
  const nextState = advance(runState, body.event);

  await sessionRef.update({
    currentNodeId: nextState.currentNodeId,
    lastEvent: body.event,
    updatedAt: Date.now(),
  });

  return c.json({ newNode: nextState.currentNodeId });
});

export const api = onRequest({ region: 'us-central1' }, async (req, res) => {
  const url = `https://${req.hostname}${req.originalUrl}`;
  const headers: Record<string, string> = {};
  Object.entries(req.headers).forEach(([key, value]) => {
    if (typeof value === 'string') {
      headers[key] = value;
    } else if (Array.isArray(value)) {
      headers[key] = value.join(',');
    }
  });

  const hasBody = !(req.method === 'GET' || req.method === 'HEAD');
  const requestBody = hasBody && req.rawBody ? new Uint8Array(req.rawBody) : undefined;

  const request = new Request(url, {
    method: req.method,
    headers,
    body: requestBody,
  });

  const response = await app.fetch(request);
  const responseBody = await response.text();
  res.status(response.status);
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  res.send(responseBody);
});
