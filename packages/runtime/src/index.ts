import crypto from 'node:crypto';

export type SeedScope = 'experiment' | 'group' | 'participant';

export function deriveSeed(baseSeed: string, scope: SeedScope, info: string): ArrayBuffer {
  return crypto.hkdfSync('sha256', Buffer.from(baseSeed, 'utf8'), Buffer.from(scope, 'utf8'), Buffer.from(info, 'utf8'), 32);
}

export function seededRandom(seed: ArrayBuffer): () => number {
  let counter = 0;
  return () => {
    const hmac = crypto.createHmac('sha256', Buffer.from(seed));
    hmac.update(Buffer.from(counter.toString(10), 'utf8'));
    counter += 1;
    const digest = hmac.digest();
    return digest.readUInt32BE(0) / 0xffffffff;
  };
}

export type Event = {
  type: string;
  payload?: unknown;
};

export type RunState = {
  currentNodeId: string;
};

export function advance(run: RunState, event: Event): RunState {
  if (event.type === 'next') {
    const nextNode = run.currentNodeId === 'intro' ? 'survey_1' : 'outro';
    return { ...run, currentNodeId: nextNode };
  }
  return run;
}
