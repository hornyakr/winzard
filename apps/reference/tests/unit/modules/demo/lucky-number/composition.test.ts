import { describe, expect, it } from 'vitest';

import { luckyNumberRangeRules } from '@/modules/demo/lucky-number/application/rules/lucky-number-range-rule';
import { ValidatedRandomIntegerGenerator } from '@/modules/demo/lucky-number/infrastructure/random/validated-random-integer-generator';

import { anonymousApplicationContext } from '../../../support/application-context';
import { GetLuckyNumber } from '@/modules/demo/lucky-number/application/queries/get-lucky-number';

describe('reference service composition', () => {
  it('stable ID alapján determinisztikusan rendezi a többes bindingot', () => {
    expect(luckyNumberRangeRules.map(({ id }) => id)).toEqual([
      'demo.lucky-number.range.integer',
      'demo.lucky-number.range.ordered',
      'demo.lucky-number.range.maximum-span',
    ]);
  });

  it('a random adapter decorator megőrzi a port contractját', () => {
    const decorated = new ValidatedRandomIntegerGenerator({
      betweenInclusive: () => 7,
    });
    const query = new GetLuckyNumber(decorated, luckyNumberRangeRules);
    expect(query.execute({ minimum: 1, maximum: 10 }, anonymousApplicationContext).value).toBe(7);
  });

  it('fail-fast módon elutasítja a hibás decorator eredményt', () => {
    const decorated = new ValidatedRandomIntegerGenerator({
      betweenInclusive: () => 11,
    });
    expect(() => decorated.betweenInclusive(1, 10)).toThrow(RangeError);
  });
});
