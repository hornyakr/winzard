import type { z } from 'zod';

import type { luckyNumberRequestSchema } from './lucky-number.schemas';

export type GenerateLuckyNumberInput = Readonly<{
  minimum: number;
  maximum: number;
}>;

export function toGenerateLuckyNumberInput(
  value: z.infer<typeof luckyNumberRequestSchema>,
): GenerateLuckyNumberInput {
  return Object.freeze({
    minimum: value.minimum,
    maximum: value.maximum,
  });
}
