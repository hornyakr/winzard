'use server';

import { demoModule } from '@/composition/demo';
import { getDemoActor } from './lucky-number.actor.server';
import type { GenerateLuckyNumberActionState } from './lucky-number.action-state';
import { luckyNumberRequestSchema } from './lucky-number.schemas';

export async function generateLuckyNumberAction(
  _previousState: GenerateLuckyNumberActionState,
  formData: FormData,
): Promise<GenerateLuckyNumberActionState> {
  const parsed = luckyNumberRequestSchema.safeParse({
    minimum: formData.get('minimum'),
    maximum: formData.get('maximum'),
  });
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const result = demoModule.commands.generateLuckyNumber.execute({
    actor: await getDemoActor(),
    ...parsed.data,
  });
  if (result.kind === 'forbidden') {
    return {
      ok: false,
      formError: 'Az egyedi tartomány operator szerepkört igényel.',
    };
  }

  return { ok: true, result: result.value };
}
