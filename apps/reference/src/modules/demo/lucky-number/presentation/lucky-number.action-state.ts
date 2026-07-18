import type { LuckyNumberDto } from '../application/dto/lucky-number.dto';

export type GenerateLuckyNumberActionState = Readonly<{
  ok: boolean;
  result?: LuckyNumberDto;
  fieldErrors?: Readonly<Partial<Record<string, readonly string[]>>>;
  formError?: string;
}>;

export const initialGenerateLuckyNumberActionState: GenerateLuckyNumberActionState = Object.freeze({
  ok: false,
});
