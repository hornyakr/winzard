import type { LuckyNumberResponse } from './lucky-number.presenter';

export type GenerateLuckyNumberActionState = Readonly<{
  ok: boolean;
  result?: LuckyNumberResponse;
  fieldErrors?: Readonly<Partial<Record<string, readonly string[]>>>;
  formError?: string;
}>;

export const initialGenerateLuckyNumberActionState: GenerateLuckyNumberActionState = Object.freeze({
  ok: false,
});
