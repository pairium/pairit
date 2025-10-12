import { useEffect, useState } from 'react';
import { useParams } from '@tanstack/react-router';

import { Button } from './components/ui/button';
import { advance, startSession } from './lib/api';
import { loadConfig } from './runtime';
import { PageRenderer } from './runtime/renderer';
import type { CompiledConfig } from './runtime/config';
import type { Page } from './runtime/types';

export default function App() {
  const { experimentId } = useParams({ from: '/$experimentId' });
  const [mode, setMode] = useState<'local' | 'remote' | null>(null);
  const [compiledConfig, setCompiledConfig] = useState<CompiledConfig | null>(null);
  const [, setCurrentPageId] = useState<string | null>(null);
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
        setMode(null);
        setCompiledConfig(null);
        setCurrentPageId(null);
        setSessionId(null);
        setPage(null);
        setEndedAt(null);
        return;
      }
      setMode(null);
      setCompiledConfig(null);
      setCurrentPageId(null);
      setSessionId(null);
      setPage(null);
      setEndedAt(null);
      setLoading(true);
      setError(null);

      try {
        const localConfig = await loadConfig(experimentId);
        if (canceled) return;
        if (localConfig) {
          const initialPageId = localConfig.initialPageId;
          const initialPage = localConfig.pages[initialPageId] ?? null;
          setMode('local');
          setCompiledConfig(localConfig);
          setCurrentPageId(initialPageId);
          setSessionId(null);
          setPage(initialPage);
          setEndedAt(initialPage?.end ? new Date().toISOString() : null);
          setLoading(false);
          return;
        }
      } catch (error) {
        console.error('Local config load failed', error);
        if (canceled) return;
      }

      try {
        const r = await startSession(experimentId);
        if (canceled) return;
        setMode('remote');
        setCompiledConfig(null);
        setCurrentPageId(r.currentPageId);
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
    if (mode === 'local' && compiledConfig) {
      const nextPage = compiledConfig.pages[a.target];
      if (!nextPage) {
        setError(`Unknown target: ${a.target}`);
        return;
      }
      setError(null);
      setCurrentPageId(a.target);
      setPage(nextPage);
      setEndedAt(nextPage.end ? new Date().toISOString() : null);
      return;
    }

    if (!sessionId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await advance(sessionId, a.target);
      setPage(r.page);
      setEndedAt(r.endedAt);
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'Failed to advance');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-6 py-4">
          <div className="text-lg font-semibold tracking-tight">Pairit Lab</div>
          <div className="text-sm text-slate-500">
            {mode === 'remote'
              ? sessionId
                ? `Session: ${sessionId}`
                : 'No session'
              : mode === 'local' && experimentId
                ? `Config: ${experimentId}`
                : '—'}
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 py-12">
        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        {loading && (
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">Loading…</div>
        )}

        {!loading && page && !endedAt && <PageRenderer page={page} onAction={onAction} />}

        {!loading && endedAt && (
          <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-8 text-center">
            <div className="text-lg font-medium">Session complete.</div>
            <div className="text-sm text-slate-500">
              {mode === 'remote'
                ? 'You can restart below to create a new session.'
                : 'You can revisit the survey from the beginning.'}
            </div>
            <div className="flex justify-center">
              <Button
                onClick={async () => {
                  if (!experimentId) return;
                  setError(null);

                  if (mode === 'local' && compiledConfig) {
                    const initialPageId = compiledConfig.initialPageId;
                    const initialPage = compiledConfig.pages[initialPageId] ?? null;
                    setCurrentPageId(initialPageId);
                    setPage(initialPage);
                    setEndedAt(initialPage?.end ? new Date().toISOString() : null);
                    return;
                  }

                  if (!sessionId) {
                    setEndedAt(null);
                    setPage(null);
                  }

                  setLoading(true);
                  try {
                    const r = await startSession(experimentId);
                    setMode('remote');
                    setCompiledConfig(null);
                    setCurrentPageId(r.currentPageId);
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
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
