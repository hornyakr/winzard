import type { ApplicationContext } from '@/application/application-context';

import type { LuckyNumberDto } from '../dto/lucky-number.dto';
import { LuckyNumberPolicy } from '../policies/lucky-number.policy';
import { GetLuckyNumber } from '../queries/get-lucky-number';

export type GenerateLuckyNumberInput = Readonly<{
  minimum: number;
  maximum: number;
}>;

export type GenerateLuckyNumberResult =
  | Readonly<{ kind: 'success'; value: LuckyNumberDto }>
  | Readonly<{ kind: 'forbidden' }>;

export class GenerateLuckyNumber {
  constructor(
    private readonly query: GetLuckyNumber,
    private readonly policy: LuckyNumberPolicy,
  ) {}

  execute(
    input: GenerateLuckyNumberInput,
    context: ApplicationContext,
  ): GenerateLuckyNumberResult {
    if (!this.policy.canGenerateCustomRange(context.actor)) return { kind: 'forbidden' };
    return {
      kind: 'success',
      value: this.query.execute(
        { minimum: input.minimum, maximum: input.maximum },
        context,
      ),
    };
  }
}
