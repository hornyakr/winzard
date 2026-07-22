import { describe, expect, it } from 'vitest';

import { validateComposition } from '@/platform/composition/validate-composition.server';

import graphManifest from '@/generated/composition/graph-manifest.json';

describe('runtime composition validation', () => {
  it('elfogadja a generált production graphot', async () => {
    await expect(validateComposition({ COMPOSITION_HASH: 'auto' })).resolves.toBeUndefined();
  });

  it('elutasítja a deployment fingerprint driftet', async () => {
    await expect(validateComposition({ COMPOSITION_HASH: '0'.repeat(64) })).rejects.toThrow('COMPOSITION_HASH_DRIFT');
  });

  it('secret értéket nem tartalmazó fingerprintet publikál', () => {
    expect(graphManifest.fingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(graphManifest)).not.toContain('postgresql://');
  });
});
