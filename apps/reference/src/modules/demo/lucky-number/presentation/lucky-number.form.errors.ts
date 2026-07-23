import type { z } from 'zod';

import type {
  LuckyNumberFieldErrors,
  LuckyNumberFormError,
  LuckyNumberFormField,
} from './lucky-number.action-state';

export type LuckyNumberMappedErrors = Readonly<{
  fieldErrors: LuckyNumberFieldErrors;
  formErrors: readonly LuckyNumberFormError[];
}>;

function isField(value: string): value is LuckyNumberFormField {
  return value === 'minimum' || value === 'maximum';
}

function stableCode(issue: z.core.$ZodIssue): string {
  return `FORM_${issue.code.toUpperCase()}`;
}

export function mapLuckyNumberIssues(error: z.ZodError): LuckyNumberMappedErrors {
  const fieldErrors: Partial<Record<LuckyNumberFormField, LuckyNumberFormError[]>> = {};
  const formErrors: LuckyNumberFormError[] = [];

  error.issues.forEach((issue, index) => {
    const field = issue.path.join('.');
    const mapped = Object.freeze({
      id: `${field || 'form'}-${issue.code}-${index}`,
      code: stableCode(issue),
      message: issue.message,
    });
    if (isField(field)) {
      (fieldErrors[field] ??= []).push(mapped);
    } else {
      formErrors.push(mapped);
    }
  });

  return Object.freeze({
    fieldErrors: Object.freeze(Object.fromEntries(
      Object.entries(fieldErrors).map(([field, values]) => [field, Object.freeze(values)]),
    )) as LuckyNumberFieldErrors,
    formErrors: Object.freeze(formErrors),
  });
}

export function forbiddenLuckyNumberError(): LuckyNumberFormError {
  return Object.freeze({
    id: 'lucky-number-forbidden',
    code: 'FORM_FORBIDDEN',
    message: 'Az egyedi tartomány operator szerepkört igényel.',
  });
}
