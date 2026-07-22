import type { LuckyNumberFormValues } from './lucky-number.action-state';

export type LuckyNumberRawFormInput = Readonly<{
  minimum: FormDataEntryValue | null;
  maximum: FormDataEntryValue | null;
  intent: FormDataEntryValue | null;
}>;

export function luckyNumberRawInput(formData: FormData): LuckyNumberRawFormInput {
  return Object.freeze({
    minimum: formData.get('minimum'),
    maximum: formData.get('maximum'),
    intent: formData.get('intent'),
  });
}

function viewValue(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value : '';
}

export function luckyNumberFormValues(raw: LuckyNumberRawFormInput): LuckyNumberFormValues {
  return Object.freeze({
    minimum: viewValue(raw.minimum),
    maximum: viewValue(raw.maximum),
  });
}
