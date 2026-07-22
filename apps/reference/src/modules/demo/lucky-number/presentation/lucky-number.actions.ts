'use server';

import { createActionRequestContext, toApplicationContext } from '@/composition/request-context.server';
import { demoModule } from '@/composition/demo.server';
import { enforceServerActionContract } from '@/platform/http/delivery-contract';

import type { GenerateLuckyNumberActionState } from './lucky-number.action-state';
import { luckyNumberActionContract } from './lucky-number.actions.contract';
import { forbiddenLuckyNumberError, mapLuckyNumberIssues } from './lucky-number.form.errors';
import { luckyNumberFormValues, luckyNumberRawInput } from './lucky-number.form.extractor';
import { toGenerateLuckyNumberInput } from './lucky-number.form.mapper';
import { toLuckyNumberResponse } from './lucky-number.presenter';
import { luckyNumberFormSchema } from './lucky-number.schemas';

export async function generateLuckyNumberAction(
  _previousState: GenerateLuckyNumberActionState,
  formData: FormData,
): Promise<GenerateLuckyNumberActionState> {
  enforceServerActionContract(luckyNumberActionContract, 'generateLuckyNumberAction');
  const raw = luckyNumberRawInput(formData);
  const values = luckyNumberFormValues(raw);
  const parsed = luckyNumberFormSchema.safeParse(raw);
  if (!parsed.success) {
    const mapped = mapLuckyNumberIssues(parsed.error);
    return Object.freeze({
      status: 'invalid',
      values,
      fieldErrors: mapped.fieldErrors,
      formErrors: mapped.formErrors,
    });
  }

  const requestContext = await createActionRequestContext();
  const result = demoModule.commands.generateLuckyNumber.execute(
    toGenerateLuckyNumberInput(parsed.data),
    toApplicationContext(requestContext),
  );
  if (result.kind === 'forbidden') {
    return Object.freeze({
      status: 'rejected',
      values,
      fieldErrors: Object.freeze({}),
      formErrors: Object.freeze([forbiddenLuckyNumberError()]),
    });
  }

  return Object.freeze({
    status: 'success',
    values,
    fieldErrors: Object.freeze({}),
    formErrors: Object.freeze([]),
    result: toLuckyNumberResponse(result.value),
  });
}
