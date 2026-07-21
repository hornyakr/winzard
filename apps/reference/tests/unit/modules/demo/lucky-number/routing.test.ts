import { describe, expect, it } from 'vitest';

import { LuckyNumberPolicy } from '@/modules/demo/lucky-number/application/policies/lucky-number.policy';
import { luckyNumberRoutes } from '@/modules/demo/lucky-number/presentation/lucky-number.routes';
import {
  luckyNumberRangeParamsSchema,
  luckyNumberRangeQuerySchema,
} from '@/modules/demo/lucky-number/presentation/lucky-number.schemas';

describe('lucky-number routing contract', () => {
  it('validálja és normalizálja a path paramétereket', () => {
    expect(luckyNumberRangeParamsSchema.parse({ minimum: '10', maximum: '20' })).toEqual({ minimum: 10, maximum: 20 });
    expect(() => luckyNumberRangeParamsSchema.parse({ minimum: '20', maximum: '10' })).toThrow();
    expect(() => luckyNumberRangeParamsSchema.parse({ minimum: '0', maximum: '10001' })).toThrow();
  });

  it('az ismételt query paraméter utolsó értékét használja', () => {
    expect(luckyNumberRangeQuerySchema.parse({ minimum: ['1', '10'], maximum: ['15', '20'] })).toEqual({ minimum: 10, maximum: 20 });
  });

  it('pure route buildert használ', () => {
    expect(luckyNumberRoutes.index()).toBe('/lucky/number');
    expect(luckyNumberRoutes.range(10, 20)).toBe('/lucky/number/range/10/20');
    expect(luckyNumberRoutes.query(10, 20)).toBe('/lucky/number?minimum=10&maximum=20');
    expect(() => luckyNumberRoutes.range(0.5, 2)).toThrow(RangeError);
  });

  it('az egyedi tartományt operator szerepkörhöz köti', () => {
    const policy = new LuckyNumberPolicy();
    expect(policy.canGenerateCustomRange({ kind: 'anonymous' })).toBe(false);
    expect(policy.canGenerateCustomRange({
      kind: 'user',
      userId: 'demo',
      roles: ['operator'],
    })).toBe(true);
  });
});
