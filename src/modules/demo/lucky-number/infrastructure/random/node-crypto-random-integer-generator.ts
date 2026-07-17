import 'server-only';

import { randomInt } from 'node:crypto';

import type { RandomIntegerGenerator } from '../../application/ports/random-integer-generator';

export class NodeCryptoRandomIntegerGenerator implements RandomIntegerGenerator {
  betweenInclusive(minimum: number, maximum: number): number {
    const inclusiveSpan = maximum - minimum + 1;
    const offset = randomInt(0, inclusiveSpan);

    return minimum + offset;
  }
}
