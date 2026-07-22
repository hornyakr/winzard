export type LuckyNumberRange = Readonly<{
  minimum: number;
  maximum: number;
}>;

export interface LuckyNumberRangeRule {
  readonly id: string;
  readonly priority: number;
  accepts(range: LuckyNumberRange): boolean;
}

const integerRangeRule: LuckyNumberRangeRule = Object.freeze({
  id: 'demo.lucky-number.range.integer',
  priority: 300,
  accepts: ({ minimum, maximum }: LuckyNumberRange) =>
    Number.isSafeInteger(minimum) && Number.isSafeInteger(maximum),
});

const orderedRangeRule: LuckyNumberRangeRule = Object.freeze({
  id: 'demo.lucky-number.range.ordered',
  priority: 200,
  accepts: ({ minimum, maximum }: LuckyNumberRange) => minimum <= maximum,
});

const maximumSpanRule: LuckyNumberRangeRule = Object.freeze({
  id: 'demo.lucky-number.range.maximum-span',
  priority: 100,
  accepts: ({ minimum, maximum }: LuckyNumberRange) => maximum - minimum <= 10_000,
});

export const luckyNumberRangeRules = Object.freeze([
  integerRangeRule,
  orderedRangeRule,
  maximumSpanRule,
].sort((left, right) =>
  right.priority - left.priority || left.id.localeCompare(right.id)));
