import { describe, expect, it } from 'vitest';

import { InvalidLuckyNumberRangeError } from '@/modules/demo/lucky-number/application/errors/invalid-lucky-number-range.error';
import type { RandomIntegerGenerator } from '@/modules/demo/lucky-number/application/ports/random-integer-generator';
import { GetLuckyNumber } from '@/modules/demo/lucky-number/application/queries/get-lucky-number';

class RecordingRandomIntegerGenerator implements RandomIntegerGenerator {
  readonly calls: Array<Readonly<{ minimum: number; maximum: number }>> = [];

  constructor(private readonly value: number) {}

  betweenInclusive(minimum: number, maximum: number): number {
    this.calls.push({ minimum, maximum });
    return this.value;
  }
}

describe('GetLuckyNumber', () => {
  it('az alapértelmezett tartományból immutable DTO-t ad vissza', () => {
    const random = new RecordingRandomIntegerGenerator(42);
    const query = new GetLuckyNumber(random);

    const result = query.execute();

    expect(result).toEqual({ value: 42, minimum: 0, maximum: 100 });
    expect(Object.isFrozen(result)).toBe(true);
    expect(random.calls).toEqual([{ minimum: 0, maximum: 100 }]);
  });

  it('elfogad egyedi, inclusive tartományt', () => {
    const random = new RecordingRandomIntegerGenerator(15);
    const query = new GetLuckyNumber(random);

    expect(query.execute({ minimum: 10, maximum: 20 })).toEqual({
      value: 15,
      minimum: 10,
      maximum: 20,
    });
    expect(random.calls).toEqual([{ minimum: 10, maximum: 20 }]);
  });

  it.each([
    { minimum: 20, maximum: 10 },
    { minimum: 0.5, maximum: 10 },
    { minimum: 0, maximum: 10_001 },
  ])('elutasítja az érvénytelen tartományt: $minimum–$maximum', ({ minimum, maximum }) => {
    const random = new RecordingRandomIntegerGenerator(0);
    const query = new GetLuckyNumber(random);

    expect(() => query.execute({ minimum, maximum })).toThrow(InvalidLuckyNumberRangeError);
    expect(random.calls).toHaveLength(0);
  });

  it('a hibában megőrzi az érvénytelen tartományt és a stabil hibakódot', () => {
    const query = new GetLuckyNumber(new RecordingRandomIntegerGenerator(0));

    try {
      query.execute({ minimum: 5, maximum: 4 });
      throw new Error('A querynek hibát kellett volna dobnia.');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidLuckyNumberRangeError);
      expect(error).toMatchObject({
        code: 'INVALID_LUCKY_NUMBER_RANGE',
        minimum: 5,
        maximum: 4,
      });
    }
  });
});
