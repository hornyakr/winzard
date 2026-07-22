import type { LuckyNumberResponse } from './lucky-number.presenter';

export type LuckyNumberFormField = 'minimum' | 'maximum';

export type LuckyNumberFormValues = Readonly<{
  minimum: string;
  maximum: string;
}>;

export type LuckyNumberFormError = Readonly<{
  id: string;
  code: string;
  message: string;
}>;

export type LuckyNumberFieldErrors = Readonly<Partial<Record<
  LuckyNumberFormField,
  readonly LuckyNumberFormError[]
>>>;

type LuckyNumberActionStateBase = Readonly<{
  values: LuckyNumberFormValues;
  fieldErrors: LuckyNumberFieldErrors;
  formErrors: readonly LuckyNumberFormError[];
}>;

export type GenerateLuckyNumberActionState =
  | Readonly<LuckyNumberActionStateBase & {
      status: 'idle';
    }>
  | Readonly<LuckyNumberActionStateBase & {
      status: 'invalid';
    }>
  | Readonly<LuckyNumberActionStateBase & {
      status: 'rejected';
    }>
  | Readonly<LuckyNumberActionStateBase & {
      status: 'success';
      result: LuckyNumberResponse;
    }>;

export const initialGenerateLuckyNumberActionState: GenerateLuckyNumberActionState = Object.freeze({
  status: 'idle',
  values: Object.freeze({ minimum: '10', maximum: '20' }),
  fieldErrors: Object.freeze({}),
  formErrors: Object.freeze([]),
});
