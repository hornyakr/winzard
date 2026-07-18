import { describe, expect, it } from 'vitest';

import { GenerateLuckyNumber } from '@/modules/demo/lucky-number/application/commands/generate-lucky-number';
import { LuckyNumberPolicy } from '@/modules/demo/lucky-number/application/policies/lucky-number.policy';
import type { RandomIntegerGenerator } from '@/modules/demo/lucky-number/application/ports/random-integer-generator';
import { GetLuckyNumber } from '@/modules/demo/lucky-number/application/queries/get-lucky-number';

class FixedRandomIntegerGenerator implements RandomIntegerGenerator {
  betweenInclusive(): number {
    return 15;
  }
}

describe('GenerateLuckyNumber', () => {
  const command = new GenerateLuckyNumber(
    new GetLuckyNumber(new FixedRandomIntegerGenerator()),
    new LuckyNumberPolicy(),
  );

  it('explicit forbidden resultot ad jogosultság nélkül', () => {
    expect(command.execute({
      actor: { subject: null, roles: [] },
      minimum: 10,
      maximum: 20,
    })).toEqual({ kind: 'forbidden' });
  });

  it('operator actor számára explicit success DTO-t ad', () => {
    expect(command.execute({
      actor: { subject: 'demo', roles: ['operator'] },
      minimum: 10,
      maximum: 20,
    })).toEqual({
      kind: 'success',
      value: { value: 15, minimum: 10, maximum: 20 },
    });
  });
});
