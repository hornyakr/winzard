import type { LuckyNumberDto } from '../dto/lucky-number.dto';
import { InvalidLuckyNumberRangeError } from '../errors/invalid-lucky-number-range.error';
import type { RandomIntegerGenerator } from '../ports/random-integer-generator';

export type GetLuckyNumberInput = Readonly<{
  minimum?: number;
  maximum?: number;
}>;

const DEFAULT_MINIMUM = 0;
const DEFAULT_MAXIMUM = 100;
const MAXIMUM_ALLOWED_SPAN = 10_000;

export class GetLuckyNumber {
  constructor(private readonly randomIntegerGenerator: RandomIntegerGenerator) {}

  execute(input: GetLuckyNumberInput = {}): LuckyNumberDto {
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
    const validIntegers = Number.isSafeInteger(minimum) && Number.isSafeInteger(maximum);
    const validOrder = minimum <= maximum;
    const validSpan = maximum - minimum <= MAXIMUM_ALLOWED_SPAN;

    if (!validIntegers || !validOrder || !validSpan) {
      throw new InvalidLuckyNumberRangeError(minimum, maximum);
    }
  }
}
