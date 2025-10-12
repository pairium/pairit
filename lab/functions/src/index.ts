import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { onRequest } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';

initializeApp();

const firestore = getFirestore();

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
};

const sessions = new Map<string, Session>();

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
  const docRef = firestore.collection('configs').doc(configId);
  const snapshot = await docRef.get();
  if (!snapshot.exists) return null;
  const data = snapshot.data() as ConfigDocument | undefined;
  if (!data || typeof data.config === 'undefined') return null;
  const config = coerceConfig(data.config);
  if (!config) return null;
  return { config, doc: { ...data, configId: data.configId ?? configId } };
}

const app = new Hono();

// Allow browser calls from Vite on localhost:3000
app.use('*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'OPTIONS'] }));

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
  sessions.set(id, session);
  const page = config.pages[session.currentPageId];
  return c.json({
    sessionId: id,
    configId,
    currentPageId: session.currentPageId,
    page,
  });
});

app.get('/sessions/:id', (c) => {
  const id = c.req.param('id');
  const session = sessions.get(id);
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
  const session = sessions.get(id);
  if (!session) return c.json({ error: 'not_found' }, 404);
  const body = (await c.req.json().catch(() => ({}))) as { target?: string };
  const target = body?.target;
  if (!target || !session.config.pages[target]) {
    return c.json({ error: 'invalid_target' }, 400);
  }
  session.currentPageId = target;
  const page = session.config.pages[target];
  if (page.end) {
    session.endedAt = new Date().toISOString();
  }
  return c.json({
    sessionId: session.id,
    configId: session.configId,
    currentPageId: session.currentPageId,
    page,
    endedAt: session.endedAt ?? null,
  });
});

// export as a Firebase HTTPS function by forwarding the incoming Express-style request
export const lab = onRequest({ region: 'us-east4' }, async (req, res) => {
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