import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { onRequest } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';

initializeApp();

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

const demoConfig: Config = {
  initialPageId: 'intro',
  pages: {
    intro: {
      id: 'intro',
      components: [
        { type: 'text', props: { text: 'Welcome. Please complete this short survey.' } },
        {
          type: 'buttons',
          props: {
            buttons: [
              { id: 'intro-start', text: 'Begin', action: { type: 'go_to', target: 'outro' } },
            ],
          },
        },
      ],
    },
    outro: {
      id: 'outro',
      end: true,
      components: [{ type: 'text', props: { text: 'Thank you!' } }],
    },
  },
};

type Session = {
  id: string;
  currentPageId: string;
  user_state: Record<string, any>;
  endedAt?: string;
};

const sessions = new Map<string, Session>();

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

const app = new Hono();

// Allow browser calls from Vite on localhost:3000
app.use('*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'OPTIONS'] }));

app.get('/', (c) => c.json({ message: 'Pairit lab API' }));

app.post('/sessions/start', async (c) => {
  const id = uid();
  const session: Session = {
    id,
    currentPageId: demoConfig.initialPageId,
    user_state: {},
  };
  sessions.set(id, session);
  const page = demoConfig.pages[session.currentPageId];
  return c.json({ sessionId: id, currentPageId: session.currentPageId, page });
});

app.get('/sessions/:id', (c) => {
  const id = c.req.param('id');
  const session = sessions.get(id);
  if (!session) return c.json({ error: 'not_found' }, 404);
  const page = demoConfig.pages[session.currentPageId];
  return c.json({
    sessionId: session.id,
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
  if (!target || !demoConfig.pages[target]) {
    return c.json({ error: 'invalid_target' }, 400);
  }
  session.currentPageId = target;
  const page = demoConfig.pages[target];
  if (page.end) {
    session.endedAt = new Date().toISOString();
  }
  return c.json({
    sessionId: session.id,
    currentPageId: session.currentPageId,
    page,
    endedAt: session.endedAt ?? null,
  });
});

// export as a Firebase HTTPS function by forwarding the incoming Express-style request
export const api = onRequest({ region: 'us-central1' }, async (req, res) => {
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