import { useEffect, useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { advance, startSession } from './lib/api';
import type { Page } from './runtime/types';
import { PageRenderer } from './runtime/renderer';

export default function App() {
  const { experimentId } = useParams({ from: '/$experimentId' });
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [page, setPage] = useState<Page | null>(null);
  const [endedAt, setEndedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let canceled = false;
    async function bootstrap() {
      if (!experimentId) {
        setError('Missing experiment ID');
        setSessionId(null);
        setPage(null);
        setEndedAt(null);
        return;
      }
      setSessionId(null);
      setPage(null);
      setEndedAt(null);
      setLoading(true);
      setError(null);
      try {
        const r = await startSession(experimentId);
        if (canceled) return;
        setSessionId(r.sessionId);
        setPage(r.page);
        setEndedAt(null);
      } catch (e: unknown) {
        if (canceled) return;
        setError(e instanceof Error ? e.message : 'Failed to start');
      } finally {
        if (!canceled) setLoading(false);
      }
    }
    bootstrap();
    return () => {
      canceled = true;
    };
  }, [experimentId]);

  async function onAction(a: { type: 'go_to'; target: string }) {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await advance(sessionId, a.target);
      setPage(r.page);
      setEndedAt(r.endedAt);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to advance');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-white text-black">
      <header className="border-b">
        <div className="max-w-4xl mx-auto p-4 flex items-center justify-between">
          <div className="font-semibold">Pairit Lab</div>
          <div className="text-sm text-gray-500">{sessionId ? `Session: ${sessionId}` : 'No session'}</div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6">
        {error && <div className="mb-4 text-red-600">{error}</div>}

        {loading && <div className="mb-4 text-gray-500">Loading…</div>}

        {sessionId && page && !endedAt && !loading && (
          <PageRenderer page={page} onAction={onAction} />
        )}

        {sessionId && endedAt && !loading && (
          <div className="space-y-3">
            <div className="text-lg">Session complete.</div>
            <button
              className="px-4 py-2 rounded bg-black text-white hover:opacity-90"
              onClick={async () => {
                if (!experimentId) return;
                setSessionId(null);
                setPage(null);
                setEndedAt(null);
                setLoading(true);
                setError(null);
                try {
                  const r = await startSession(experimentId);
                  setSessionId(r.sessionId);
                  setPage(r.page);
                  setEndedAt(null);
                } catch (e: unknown) {
                  setError(e instanceof Error ? e.message : 'Failed to start');
                } finally {
                  setLoading(false);
                }
              }}
            >
              Restart
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
