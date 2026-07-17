import { z } from 'zod';

const safeInteger = z.coerce.number().int().refine(Number.isSafeInteger, 'Biztonságos egész szám szükséges.');

export const luckyNumberRangeSchema = z.object({
  minimum: safeInteger,
  maximum: safeInteger,
}).superRefine(({ minimum, maximum }, context) => {
  if (minimum > maximum) {
    context.addIssue({ code: 'custom', path: ['maximum'], message: 'A maximum nem lehet kisebb a minimumnál.' });
  }
  if (maximum - minimum > 10_000) {
    context.addIssue({ code: 'custom', path: ['maximum'], message: 'A tartomány legfeljebb 10 000 értéket fedhet le.' });
  }
});

export const luckyNumberRangeParamsSchema = luckyNumberRangeSchema;

const optionalQueryInteger = z.preprocess(
  (value) => Array.isArray(value) ? value.at(-1) : value,
  safeInteger.optional(),
);

export const luckyNumberRangeQuerySchema = z.object({
  minimum: optionalQueryInteger,
  maximum: optionalQueryInteger,
}).superRefine(({ minimum, maximum }, context) => {
  const resolvedMinimum = minimum ?? 0;
  const resolvedMaximum = maximum ?? 100;
  if (resolvedMinimum > resolvedMaximum) {
    context.addIssue({ code: 'custom', path: ['maximum'], message: 'A maximum nem lehet kisebb a minimumnál.' });
  }
  if (resolvedMaximum - resolvedMinimum > 10_000) {
    context.addIssue({ code: 'custom', path: ['maximum'], message: 'A tartomány legfeljebb 10 000 értéket fedhet le.' });
  }
});

export const luckyNumberRequestSchema = luckyNumberRangeSchema;

export type LuckyNumberRange = z.infer<typeof luckyNumberRangeSchema>;
