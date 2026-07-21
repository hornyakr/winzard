'use server';

import { demoModule } from '@/composition/demo';
import { enforceServerActionContract } from '@/platform/http/delivery-contract';
import { createActionRequestContext, toApplicationContext } from '@/composition/request-context.server';

import type { GenerateLuckyNumberActionState } from './lucky-number.action-state';
import { luckyNumberActionContract } from './lucky-number.actions.contract';
import { toLuckyNumberResponse } from './lucky-number.presenter';
import { luckyNumberRequestSchema } from './lucky-number.schemas';

export async function generateLuckyNumberAction(
  _previousState: GenerateLuckyNumberActionState,
  formData: FormData,
): Promise<GenerateLuckyNumberActionState> {
  enforceServerActionContract(luckyNumberActionContract, 'generateLuckyNumberAction');
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

  const requestContext = await createActionRequestContext();
  const result = demoModule.commands.generateLuckyNumber.execute(
    parsed.data,
    toApplicationContext(requestContext),
  );
  if (result.kind === 'forbidden') {
    return {
      ok: false,
      formError: 'Az egyedi tartomány operator szerepkört igényel.',
    };
  }

  return { ok: true, result: toLuckyNumberResponse(result.value) };
}
