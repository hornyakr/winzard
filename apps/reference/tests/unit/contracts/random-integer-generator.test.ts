import { describe, expect, it } from 'vitest';

import type { RandomIntegerGenerator } from '@/modules/demo/lucky-number/application/ports/random-integer-generator';
import { NodeCryptoRandomIntegerGenerator } from '@/modules/demo/lucky-number/infrastructure/random/node-crypto-random-integer-generator';
import { ValidatedRandomIntegerGenerator } from '@/modules/demo/lucky-number/infrastructure/random/validated-random-integer-generator';

function randomIntegerGeneratorContractSuite(
  name: string,
  createProvider: () => RandomIntegerGenerator,
): void {
  describe(`${name} RandomIntegerGenerator contract`, () => {
    it('returns safe integers inside the inclusive range', () => {
      const provider = createProvider();
      for (let attempt = 0; attempt < 128; attempt += 1) {
        const value = provider.betweenInclusive(-7, 13);
        expect(Number.isSafeInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(-7);
        expect(value).toBeLessThanOrEqual(13);
      }
    });

    it('supports a degenerate inclusive range', () => {
      expect(createProvider().betweenInclusive(11, 11)).toBe(11);
    });
  });
}

randomIntegerGeneratorContractSuite('node-crypto', () => new NodeCryptoRandomIntegerGenerator());
randomIntegerGeneratorContractSuite('validated node-crypto', () => new ValidatedRandomIntegerGenerator(new NodeCryptoRandomIntegerGenerator()));

describe('ValidatedRandomIntegerGenerator negative contract cases', () => {
  it('rejects an out-of-contract provider result', () => {
    const invalid: RandomIntegerGenerator = Object.freeze({
      betweenInclusive: (_minimum: number, maximum: number) => maximum + 1,
    });
    const provider = new ValidatedRandomIntegerGenerator(invalid);
    expect(() => provider.betweenInclusive(0, 10)).toThrow(RangeError);
  });
});
