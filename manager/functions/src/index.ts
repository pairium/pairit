import { Hono } from 'hono';
import { onRequest } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';

initializeApp();

const firestore = getFirestore();

const app = new Hono();

type ConfigDocument = {
  configId: string;
  owner: string;
  checksum: string;
  metadata: Record<string, unknown> | null;
  config: unknown;
  createdAt?: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
};

const COLLECTION = 'configs';

app.post('/configs/upload', async (c) => {
  const body = await c.req
    .json<{ configId: string; owner: string; checksum: string; metadata?: Record<string, unknown>; config: unknown }>()
    .catch(() => null);

  if (!body) return c.json({ error: 'invalid_json' }, 400);

  const { configId, owner, checksum, metadata, config } = body;

  if (!configId || !owner || !checksum || typeof config === 'undefined')
    return c.json({ error: 'missing_fields' }, 400);

  try {
    const docRef = firestore.collection(COLLECTION).doc(configId);
    const existing = await docRef.get();

    const payload: ConfigDocument = {
      configId,
      owner,
      checksum,
      metadata: (metadata ?? null) as Record<string, unknown> | null,
      config,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (!existing.exists) {
      payload.createdAt = FieldValue.serverTimestamp();
    }

    await docRef.set(payload, { merge: true });

    const snapshot = await docRef.get();
    const data = snapshot.data() as ConfigDocument | undefined;
    return c.json(
      {
        configId: data?.configId ?? configId,
        owner: data?.owner ?? owner,
        checksum: data?.checksum ?? checksum,
        metadata: data?.metadata ?? null,
        updatedAt: data?.updatedAt instanceof Timestamp ? data.updatedAt.toDate().toISOString() : null,
        createdAt: data?.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : null,
      },
      200,
    );
  } catch (error) {
    console.error('upload error', error);
    return c.json({ error: 'internal', message: error instanceof Error ? error.message : 'unknown error' }, 500);
  }
});

app.get('/configs', async (c) => {
  const owner = c.req.query('owner');
  const query = owner
    ? firestore.collection(COLLECTION).where('owner', '==', owner)
    : firestore.collection(COLLECTION);

  try {
    const snapshot = await query.orderBy('updatedAt', 'desc').get();
    const items = snapshot.docs.map((snapshotDoc) => {
      const data = snapshotDoc.data() as ConfigDocument;
      return {
        configId: data.configId ?? snapshotDoc.id,
        owner: data.owner,
        checksum: data.checksum,
        updatedAt:
          data.updatedAt instanceof Timestamp
            ? data.updatedAt.toDate().toISOString()
            : null,
        metadata: data.metadata ?? null,
      };
    });
    return c.json({ configs: items }, 200);
  } catch (error) {
    console.error('list error', error);
    return c.json({ error: 'internal', message: error instanceof Error ? error.message : 'unknown error' }, 500);
  }
});

app.delete('/configs/:configId', async (c) => {
  const configId = c.req.param('configId');

  if (!configId) return c.json({ error: 'missing_config_id' }, 400);

  try {
    const docRef = firestore.collection(COLLECTION).doc(configId);
    const snapshot = await docRef.get();
    if (!snapshot.exists) return c.json({ error: 'not_found' }, 404);

    await docRef.delete();
    return c.json({ configId }, 200);
  } catch (error) {
    console.error('delete error', error);
    return c.json({ error: 'internal', message: error instanceof Error ? error.message : 'unknown error' }, 500);
  }
});

export const api = onRequest({ region: 'us-east4' }, async (req, res) => {
  const url = `https://${req.hostname}${req.originalUrl}`;

  const headers: Record<string, string> = {};
  Object.entries(req.headers).forEach(([k, v]) => {
    if (typeof v === 'string') headers[k] = v;
    else if (Array.isArray(v)) headers[k] = v.join(',');
  });

  const hasBody = !(req.method === 'GET' || req.method === 'HEAD');
  const requestBody = hasBody && req.rawBody ? new Uint8Array(req.rawBody) : undefined;

  const request = new Request(url, {
    method: req.method,
    headers,
    body: requestBody,
  });

  const response = await app.fetch(request);
  const text = await response.text();

  res.status(response.status);
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.send(text);
});