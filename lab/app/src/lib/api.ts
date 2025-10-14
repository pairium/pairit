import type { Page } from '../runtime/types'

const baseUrl = import.meta.env.VITE_API_URL;

type StartResponse = { sessionId: string; configId: string; currentPageId: string; page: Page };
type GetResponse = { sessionId: string; currentPageId: string; page: Page; endedAt: string | null };
type AdvanceResponse = GetResponse;
type SubmitEventResponse = { eventId: string };

export type EventPayload = {
  type: string;
  timestamp: string;
  componentType: string;
  componentId: string;
  data: Record<string, unknown>;
};

export async function startSession(configId: string): Promise<StartResponse> {
  const r = await fetch(`${baseUrl}/sessions/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ configId }),
  });
  if (!r.ok) throw new Error('Failed to start session');
  return r.json();
}

export async function getSession(sessionId: string): Promise<GetResponse> {
  const r = await fetch(`${baseUrl}/sessions/${sessionId}`);
  if (!r.ok) throw new Error('Session not found');
  return r.json();
}

export async function advance(sessionId: string, target: string): Promise<AdvanceResponse> {
  const r = await fetch(`${baseUrl}/sessions/${sessionId}/advance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target }),
  });
  if (!r.ok) throw new Error('Failed to advance');
  return r.json();
}

export async function submitEvent(sessionId: string, event: EventPayload): Promise<SubmitEventResponse> {
  const r = await fetch(`${baseUrl}/sessions/${sessionId}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  });
  if (!r.ok) throw new Error('Failed to submit event');
  return r.json();
}
