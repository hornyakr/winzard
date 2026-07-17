import { describe, expect, it } from 'vitest';

import { NodeCryptoRandomIntegerGenerator } from '@/modules/demo/lucky-number/infrastructure/random/node-crypto-random-integer-generator';

describe('NodeCryptoRandomIntegerGenerator', () => {
  const generator = new NodeCryptoRandomIntegerGenerator();

  it.each([
    { minimum: 0, maximum: 100 },
    { minimum: -20, maximum: -10 },
    { minimum: 7, maximum: 7 },
    { minimum: Number.MAX_SAFE_INTEGER - 10, maximum: Number.MAX_SAFE_INTEGER },
  ])('inclusive egész számot ad a $minimum–$maximum tartományból', ({ minimum, maximum }) => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const value = generator.betweenInclusive(minimum, maximum);

      expect(Number.isSafeInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(minimum);
      expect(value).toBeLessThanOrEqual(maximum);
    }
  });
});
