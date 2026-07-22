import { z } from 'zod';

const safeInteger = z.coerce.number().int().refine(Number.isSafeInteger, 'Biztonságos egész szám szükséges.');
const rangeShape = {
  minimum: safeInteger,
  maximum: safeInteger,
} as const;

type RangeValue = Readonly<{ minimum: number; maximum: number }>;

function validateRange(value: RangeValue, context: z.RefinementCtx): void {
  if (value.minimum > value.maximum) {
    context.addIssue({ code: 'custom', path: ['maximum'], message: 'A maximum nem lehet kisebb a minimumnál.' });
  }
  if (value.maximum - value.minimum > 10_000) {
    context.addIssue({ code: 'custom', path: ['maximum'], message: 'A tartomány legfeljebb 10 000 értéket fedhet le.' });
  }
}

export const luckyNumberRangeSchema = z.object(rangeShape).strict().superRefine(validateRange);
export const luckyNumberRangeParamsSchema = luckyNumberRangeSchema;
export const luckyNumberRequestSchema = luckyNumberRangeSchema;

const optionalQueryInteger = z.preprocess(
  (value) => Array.isArray(value) ? value.at(-1) : value,
  safeInteger.optional(),
);

export const luckyNumberRangeQuerySchema = z.object({
  minimum: optionalQueryInteger,
  maximum: optionalQueryInteger,
}).strict().superRefine(({ minimum, maximum }, context) => {
  validateRange({ minimum: minimum ?? 0, maximum: maximum ?? 100 }, context);
});

export const luckyNumberFormSchema = z.object({
  ...rangeShape,
  intent: z.literal('generate'),
}).strict().superRefine(validateRange);

export type LuckyNumberRange = z.infer<typeof luckyNumberRangeSchema>;
