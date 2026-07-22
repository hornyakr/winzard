import 'server-only';

import type { RandomIntegerGenerator } from '../../application/ports/random-integer-generator';

export class ValidatedRandomIntegerGenerator implements RandomIntegerGenerator {
  constructor(private readonly next: RandomIntegerGenerator) {}

  betweenInclusive(minimum: number, maximum: number): number {
    const value = this.next.betweenInclusive(minimum, maximum);
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
      throw new RangeError('A random integer adapter a deklarált tartományon kívüli értéket adott.');
    }
    return value;
  }
}
