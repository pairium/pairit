import { describe, expect, it } from 'vitest';
import { compileYamlToCanonicalJson } from './index';

describe('compileYamlToCanonicalJson', () => {
  it('normalizes text and buttons into components', () => {
    const source = `nodes:\n  - id: intro\n    text: Hello\n    buttons:\n      - text: Next\n        action:\n          type: next\nflow:\n  - from: intro\n    to: outro\n`;

    const result = compileYamlToCanonicalJson(source);
    expect(result.nodes[0].components).toEqual([
      { type: 'text', props: { text: 'Hello' } },
      {
        type: 'buttons',
        props: {
          buttons: [
            {
              text: 'Next',
              action: { type: 'next' },
            },
          ],
        },
      },
    ]);
  });
});
