import { Hono } from 'hono';
import { onRequest } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { requireAuth, type AuthenticatedUser } from './middleware';
import { cliAuthApp } from './cli-auth';

initializeApp();

const firestore = getFirestore();
const storage = getStorage();
console.log('[AUTH-v2] Manager functions initialized');

const DEFAULT_MEDIA_BUCKET = process.env.PAIRIT_MEDIA_BUCKET ?? 'pairit-lab.firebasestorage.app';

function normalizeBucketName(name: string): string {
  if (name.startsWith('gs://')) return name.slice(5);
  return name;
}

function getMediaBucket(bucketName?: string) {
  const target = normalizeBucketName(bucketName ?? DEFAULT_MEDIA_BUCKET);
  return storage.bucket(target);
}

function buildPublicUrl(bucketName: string, objectName: string): string {
  const encoded = encodeURIComponent(objectName).replace(/%2F/g, '/');
  return `https://storage.googleapis.com/${bucketName}/${encoded}`;
}

const app = new Hono();

// Mount CLI authentication routes (no auth required for login flow)
app.route('/', cliAuthApp);

type ConfigDocument = {
  configId: string;
  owner: string;
  checksum: string;
  metadata: Record<string, unknown> | null;
  config: unknown;
  createdAt?: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
};

type MediaUploadBody = {
  bucket?: string;
  object: string;
  checksum?: string;
  data: string;
  contentType?: string | null;
  metadata?: Record<string, unknown> | null;
  public?: boolean;
};

type MediaListItem = {
  name: string;
  bucket: string;
  size?: number;
  updatedAt?: string | null;
  contentType?: string | null;
  publicUrl?: string;
  metadata?: Record<string, unknown> | null;
};

const COLLECTION = 'configs';

// Security: All config and media endpoints require authentication
app.post('/configs/upload', requireAuth, async (c) => {
  // Debug: Log to verify new code is running
  console.log('[AUTH-v2] Config upload endpoint called');
  
  const user = c.get('user');
  const body = await c.req
    .json<{ configId: string; checksum: string; metadata?: Record<string, unknown>; config: unknown }>()
    .catch(() => null);

  if (!body) {
    console.log('[AUTH-v2] Invalid JSON body');
    return c.json({ error: 'invalid_json' }, 400);
  }
  
  console.log('[AUTH-v2] Body received:', { configId: body.configId, hasChecksum: !!body.checksum, hasConfig: typeof body.config !== 'undefined' });

  const { configId, checksum, metadata, config } = body;

  // Security: Validate required fields and sanitize configId
  if (!configId || typeof configId !== 'string' || configId.trim().length === 0) {
    return c.json({ error: 'invalid_config_id' }, 400);
  }
  if (!checksum || typeof checksum !== 'string') {
    return c.json({ error: 'invalid_checksum' }, 400);
  }
  if (typeof config === 'undefined') {
    return c.json({ error: 'missing_config' }, 400);
  }

  // Security: Use authenticated user's UID as owner (prevent owner spoofing)
  const owner = user.uid;
  const sanitizedConfigId = configId.trim();

  try {
    const docRef = firestore.collection(COLLECTION).doc(sanitizedConfigId);
    const existing = await docRef.get();

    const payload: ConfigDocument = {
      configId: sanitizedConfigId,
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

// Security: Require auth, filter by authenticated user's configs only
app.get('/configs', requireAuth, async (c) => {
  const user = c.get('user');
  
  // Security: Only return configs owned by authenticated user
  const query = firestore.collection(COLLECTION).where('owner', '==', user.uid);

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

// Security: Require auth and verify ownership before deletion
app.delete('/configs/:configId', requireAuth, async (c) => {
  const user = c.get('user');
  const configId = c.req.param('configId');

  if (!configId || typeof configId !== 'string') {
    return c.json({ error: 'missing_config_id' }, 400);
  }

  try {
    const docRef = firestore.collection(COLLECTION).doc(configId);
    const snapshot = await docRef.get();
    if (!snapshot.exists) {
      return c.json({ error: 'not_found' }, 404);
    }

    const data = snapshot.data() as ConfigDocument | undefined;
    
    // Security: Verify ownership before deletion
    if (!data || data.owner !== user.uid) {
      return c.json({ error: 'forbidden', message: 'You do not have permission to delete this config.' }, 403);
    }

    await docRef.delete();
    return c.json({ configId }, 200);
  } catch (error) {
    console.error('delete error', error);
    return c.json({ error: 'internal', message: error instanceof Error ? error.message : 'unknown error' }, 500);
  }
});

// Security: Require authentication for all media operations
app.post('/media/upload', requireAuth, async (c) => {
  const body = await c.req.json<MediaUploadBody>().catch(() => null);
  if (!body) return c.json({ error: 'invalid_json' }, 400);

  const { bucket, object, data, contentType, metadata, public: shouldPublish } = body;

  if (!object || typeof object !== 'string') {
    return c.json({ error: 'invalid_object', message: 'object must be a non-empty string' }, 400);
  }

  if (!data || typeof data !== 'string') {
    return c.json({ error: 'invalid_data', message: 'data must be a base64 string' }, 400);
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(data, 'base64');
  } catch (error) {
    console.error('media upload base64 decode error', error);
    return c.json({ error: 'invalid_data', message: 'unable to decode base64 data' }, 400);
  }

  try {
    const bucketRef = getMediaBucket(bucket);
    const file = bucketRef.file(object);

    const saveOptions: Parameters<typeof file.save>[1] = {
      resumable: false,
    };

    if (contentType) {
      saveOptions.contentType = contentType;
    }

    if (metadata && typeof metadata === 'object') {
      saveOptions.metadata = { metadata };
    }

    await file.save(buffer, saveOptions);

    const wantsPublic = shouldPublish !== false;
    if (wantsPublic) {
      await file.makePublic();
    }

    const [fileMetadata] = await file.getMetadata();

    return c.json(
      {
        bucket: bucketRef.name,
        object: file.name,
        size: fileMetadata.size ? Number(fileMetadata.size) : buffer.length,
        contentType: fileMetadata.contentType ?? contentType ?? null,
        updatedAt: fileMetadata.updated ? new Date(fileMetadata.updated).toISOString() : null,
        checksum: fileMetadata.md5Hash ?? null,
        publicUrl: wantsPublic ? buildPublicUrl(bucketRef.name, file.name) : undefined,
        metadata: fileMetadata.metadata ?? null,
      },
      200,
    );
  } catch (error) {
    console.error('media upload error', error);
    return c.json(
      { error: 'internal', message: error instanceof Error ? error.message : 'unknown error' },
      500,
    );
  }
});

// Security: Require authentication to list media
app.get('/media', requireAuth, async (c) => {
  const bucket = c.req.query('bucket');
  const prefix = c.req.query('prefix') ?? undefined;

  try {
    const bucketRef = getMediaBucket(bucket ?? undefined);
    const [files] = await bucketRef.getFiles({ prefix: prefix ?? undefined });

    const objects: MediaListItem[] = await Promise.all(
      files.map(async (file) => {
        const metadata = file.metadata ?? (await file.getMetadata())[0];
        return {
          name: file.name,
          bucket: file.bucket.name,
          size: metadata.size ? Number(metadata.size) : undefined,
          updatedAt: metadata.updated ? new Date(metadata.updated).toISOString() : null,
          contentType: metadata.contentType ?? null,
          publicUrl: buildPublicUrl(file.bucket.name, file.name),
          metadata: metadata.metadata ?? null,
        } satisfies MediaListItem;
      }),
    );

    return c.json({ objects }, 200);
  } catch (error) {
    console.error('media list error', error);
    return c.json(
      { error: 'internal', message: error instanceof Error ? error.message : 'unknown error' },
      500,
    );
  }
});

// Security: Require authentication to delete media
app.delete('/media/:object', requireAuth, async (c) => {
  const object = c.req.param('object');

  if (!object) return c.json({ error: 'missing_object', message: 'object path required' }, 400);

  try {
    const bucketRef = getMediaBucket(DEFAULT_MEDIA_BUCKET);
    const file = bucketRef.file(object);
    const [exists] = await file.exists();
    if (!exists) return c.json({ error: 'not_found' }, 404);

    await file.delete();
    return c.json({ bucket: bucketRef.name, object }, 200);
  } catch (error) {
    console.error('media delete error', error);
    return c.json(
      { error: 'internal', message: error instanceof Error ? error.message : 'unknown error' },
      500,
    );
  }
});

export const manager = onRequest({ 
  region: 'us-east4', 
  invoker: 'public',
  secrets: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'PAIRIT_FIREBASE_API_KEY'],
}, async (req, res) => {
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