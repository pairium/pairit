import { Hono } from 'hono';
import { onRequest } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';

initializeApp();

const app = new Hono();

// simple route
app.get('/', (c) => {
  return c.json({ message: 'Hello from Hono on Firebase Functions' });
});

// example JSON route
app.post('/echo', async (c) => {
  const body = await c.req.json().catch(() => null);
  return c.json({ received: body });
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