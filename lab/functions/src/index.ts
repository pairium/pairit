import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { onRequest } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

initializeApp();

const firestore = getFirestore();
console.log('Lab functions initialized');

// Get path to configs directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const configsDir = join(__dirname, '../../app/public/configs');

type ButtonAction = { type: 'go_to'; target: string };
type Button = { id: string; text: string; action: ButtonAction };
type ComponentInstance =
  | { type: 'text'; props: { text: string } }
  | { type: 'buttons'; props: { buttons: Button[] } };

type Page = {
  id: string;
  end?: boolean;
  components?: ComponentInstance[];
};

type Config = {
  initialPageId: string;
  pages: Record<string, Page>;
};

type ConfigDocument = {
  configId: string;
  owner?: string;
  checksum?: string;
  metadata?: Record<string, unknown> | null;
  config: unknown;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
};

type Session = {
  id: string;
  configId: string;
  config: Config;
  currentPageId: string;
  user_state: Record<string, any>;
  endedAt?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

type SessionDocument = {
  id: string;
  configId: string;
  config: Config;
  currentPageId: string;
  user_state: Record<string, any>;
  endedAt?: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

type Event = {
  type: string;
  timestamp: string;
  sessionId: string;
  configId: string;
  pageId: string;
  componentType: string;
  componentId: string;
  data: Record<string, unknown>;
};

type EventDocument = Event & {
  createdAt: Timestamp;
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function isPage(value: unknown): value is Page {
  if (!value || typeof value !== 'object') return false;
  const page = value as Page;
  if (typeof page.id !== 'string') return false;
  if (page.components && !Array.isArray(page.components)) return false;
  return true;
}

function coerceConfig(raw: unknown): Config | null {
  if (!raw || typeof raw !== 'object') return null;
  const config = raw as Partial<Config> & {
    initialPageId?: unknown;
    nodes?: unknown;
  };

  const initialPageId =
    typeof config.initialPageId === 'string'
      ? config.initialPageId
      : typeof config.initialPageId === 'string'
        ? config.initialPageId
        : null;

  if (!initialPageId) return null;

  const pagesInput: unknown = config.pages ?? config.nodes;

  if (!pagesInput || (typeof pagesInput !== 'object' && !Array.isArray(pagesInput))) {
    return null;
  }

  const pages: Record<string, Page> = {};

  if (Array.isArray(pagesInput)) {
    for (const entry of pagesInput) {
      if (!isPage(entry)) return null;
      pages[entry.id] = entry;
    }
  } else {
    for (const [key, value] of Object.entries(pagesInput)) {
      if (!isPage(value)) return null;
      pages[key] = value;
    }
  }

  if (!pages[initialPageId]) return null;

  return { initialPageId, pages };
}

async function loadConfig(configId: string): Promise<{ config: Config; doc: ConfigDocument } | null> {
  // First try to load from Firestore
  const docRef = firestore.collection('configs').doc(configId);
  const snapshot = await docRef.get();
  if (snapshot.exists) {
    const data = snapshot.data() as ConfigDocument | undefined;
    if (data && typeof data.config !== 'undefined') {
      const config = coerceConfig(data.config);
      if (config) {
        return { config, doc: { ...data, configId: data.configId ?? configId } };
      }
    }
  }

  // Fallback: try to load from local configs directory (for development)
  try {
    const configPath = join(configsDir, `${configId}.json`);
    const configContent = await readFile(configPath, 'utf8');
    const raw = JSON.parse(configContent);
    const config = coerceConfig(raw);
    if (config) {
      return {
        config,
        doc: {
          configId,
          owner: 'local',
          checksum: undefined,
          metadata: null,
          config: raw,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now()
        }
      };
    }
  } catch (error) {
    console.log(`Local config fallback failed for ${configId}:`, error);
  }

  return null;
}

async function loadSession(sessionId: string): Promise<Session | null> {
  const docRef = firestore.collection('sessions').doc(sessionId);
  const snapshot = await docRef.get();
  if (!snapshot.exists) return null;
  const data = snapshot.data() as SessionDocument | undefined;
  if (!data) return null;
  return {
    id: data.id,
    configId: data.configId,
    config: data.config,
    currentPageId: data.currentPageId,
    user_state: data.user_state,
    endedAt: data.endedAt ?? undefined,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

async function saveSession(session: Session): Promise<void> {
  const docRef = firestore.collection('sessions').doc(session.id);
  const now = Timestamp.now();
  const doc: SessionDocument = {
    id: session.id,
    configId: session.configId,
    config: session.config,
    currentPageId: session.currentPageId,
    user_state: session.user_state,
    endedAt: session.endedAt ?? null,
    createdAt: session.createdAt ?? now,
    updatedAt: now,
  };
  await docRef.set(doc);
}

const app = new Hono();

// Allow browser calls from Vite on localhost:3000
app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposeHeaders: ['Content-Type'],
    maxAge: 86400,
  }),
);

app.get('/', (c) => c.json({ message: 'Pairit lab API' }));

app.get('/configs/:configId', async (c) => {
  const configId = c.req.param('configId');
  if (!configId) return c.json({ error: 'missing_config_id' }, 400);
  try {
    const loaded = await loadConfig(configId);
    if (!loaded) return c.json({ error: 'config_not_found' }, 404);
    const { doc } = loaded;
    return c.json({
      configId: doc.configId,
      owner: doc.owner ?? null,
      checksum: doc.checksum ?? null,
      metadata: doc.metadata ?? null,
      config: loaded.config,
      createdAt: doc.createdAt instanceof Timestamp ? doc.createdAt.toDate().toISOString() : null,
      updatedAt: doc.updatedAt instanceof Timestamp ? doc.updatedAt.toDate().toISOString() : null,
    });
  } catch (error) {
    console.error('config fetch error', error);
    return c.json({ error: 'internal' }, 500);
  }
});

app.post('/sessions/start', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { configId?: string } | null;
  const configId = body?.configId?.trim();
  if (!configId) {
    return c.json({ error: 'missing_config_id' }, 400);
  }

  const loaded = await loadConfig(configId);
  if (!loaded) {
    return c.json({ error: 'config_not_found' }, 404);
  }

  const { config } = loaded;
  const id = uid();
  const session: Session = {
    id,
    configId,
    config,
    currentPageId: config.initialPageId,
    user_state: {},
  };
  await saveSession(session);
  const page = config.pages[session.currentPageId];
  return c.json({
    sessionId: id,
    configId,
    currentPageId: session.currentPageId,
    page,
  });
});

app.get('/sessions/:id', async (c) => {
  const id = c.req.param('id');
  const session = await loadSession(id);
  if (!session) return c.json({ error: 'not_found' }, 404);
  const page = session.config.pages[session.currentPageId];
  return c.json({
    sessionId: session.id,
    configId: session.configId,
    currentPageId: session.currentPageId,
    page,
    endedAt: session.endedAt ?? null,
  });
});

// Simple advance: client tells us the next target
app.post('/sessions/:id/advance', async (c) => {
  const id = c.req.param('id');
  const session = await loadSession(id);
  if (!session) return c.json({ error: 'not_found' }, 404);
  const body = (await c.req.json().catch(() => ({}))) as { target?: string };
  const target = body?.target;
  if (!target) {
    return c.json({ error: 'missing_target' }, 400);
  }
  session.currentPageId = target;

  // In hybrid mode, we don't validate page existence since frontend manages its own config
  // Just update the session state
  const page = session.config.pages[target] || { id: target, components: [] };

  if (page.end) {
    session.endedAt = new Date().toISOString();
  }
  await saveSession(session);
  return c.json({
    sessionId: session.id,
    configId: session.configId,
    currentPageId: session.currentPageId,
    page,
    endedAt: session.endedAt ?? null,
  });
});

app.post('/sessions/:id/events', async (c) => {
  const sessionId = c.req.param('id');
  const session = await loadSession(sessionId);
  if (!session) return c.json({ error: 'session_not_found' }, 404);

  const body = (await c.req.json().catch(() => null)) as Partial<Event> | null;
  if (!body) return c.json({ error: 'invalid_body' }, 400);

  // Validate required fields
  if (!body.type || typeof body.type !== 'string') {
    return c.json({ error: 'missing_type' }, 400);
  }
  if (!body.componentType || typeof body.componentType !== 'string') {
    return c.json({ error: 'missing_component_type' }, 400);
  }
  if (!body.componentId || typeof body.componentId !== 'string') {
    return c.json({ error: 'missing_component_id' }, 400);
  }
  if (!body.timestamp || typeof body.timestamp !== 'string') {
    return c.json({ error: 'missing_timestamp' }, 400);
  }
  if (!body.data || typeof body.data !== 'object') {
    return c.json({ error: 'missing_data' }, 400);
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
    createdAt: Timestamp.now(),
  };

  const eventRef = await firestore.collection('events').add(event);
  return c.json({ eventId: eventRef.id });
});

// export as a Firebase HTTPS function by forwarding the incoming Express-style request
export const lab = onRequest({ region: 'us-east4' }, async (req, res) => {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  const requestedHeaders = typeof req.headers['access-control-request-headers'] === 'string'
    ? req.headers['access-control-request-headers']
    : 'Content-Type,Authorization,X-Requested-With';
  res.setHeader('Access-Control-Allow-Headers', requestedHeaders);

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

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