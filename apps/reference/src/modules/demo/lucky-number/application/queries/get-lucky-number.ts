import type { ApplicationContext } from '@/application/application-context';

import type { LuckyNumberDto } from '../dto/lucky-number.dto';
import { InvalidLuckyNumberRangeError } from '../errors/invalid-lucky-number-range.error';
import type { RandomIntegerGenerator } from '../ports/random-integer-generator';
import {
  luckyNumberRangeRules,
  type LuckyNumberRangeRule,
} from '../rules/lucky-number-range-rule';

export type GetLuckyNumberInput = Readonly<{
  minimum?: number;
  maximum?: number;
}>;

const DEFAULT_MINIMUM = 0;
const DEFAULT_MAXIMUM = 100;

export class GetLuckyNumber {
  constructor(
    private readonly randomIntegerGenerator: RandomIntegerGenerator,
    private readonly rangeRules: readonly LuckyNumberRangeRule[] = luckyNumberRangeRules,
  ) {}

  execute(input: GetLuckyNumberInput, context: ApplicationContext): LuckyNumberDto {
    void context;
    const minimum = input.minimum ?? DEFAULT_MINIMUM;
    const maximum = input.maximum ?? DEFAULT_MAXIMUM;

    this.assertValidRange(minimum, maximum);

    return Object.freeze({
      value: this.randomIntegerGenerator.betweenInclusive(minimum, maximum),
      minimum,
      maximum,
    });
  }

  private assertValidRange(minimum: number, maximum: number): void {
    const range = Object.freeze({ minimum, maximum });
    if (this.rangeRules.some((rule) => !rule.accepts(range))) {
      throw new InvalidLuckyNumberRangeError(minimum, maximum);
    }
  }
}
