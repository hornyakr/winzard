import { describe, expect, it } from 'vitest';

import { mapLuckyNumberIssues } from '../../../../../src/modules/demo/lucky-number/presentation/lucky-number.form.errors';
import { luckyNumberFormValues, luckyNumberRawInput } from '../../../../../src/modules/demo/lucky-number/presentation/lucky-number.form.extractor';
import { toGenerateLuckyNumberInput } from '../../../../../src/modules/demo/lucky-number/presentation/lucky-number.form.mapper';
import { luckyNumberFormSchema } from '../../../../../src/modules/demo/lucky-number/presentation/lucky-number.schemas';

describe('Lucky Number form contract', () => {
  it('explicit raw inputot és biztonságos view values értéket készít', () => {
    const formData = new FormData();
    formData.set('minimum', '10');
    formData.set('maximum', '20');
    formData.set('intent', 'generate');
    formData.set('ignored', 'value');
    const raw = luckyNumberRawInput(formData);
    expect(raw).toEqual({ minimum: '10', maximum: '20', intent: 'generate' });
    expect(luckyNumberFormValues(raw)).toEqual({ minimum: '10', maximum: '20' });
  });

  it('strict form schemát és explicit application input mappert használ', () => {
    const parsed = luckyNumberFormSchema.parse({ minimum: '10', maximum: '20', intent: 'generate' });
    expect(toGenerateLuckyNumberInput(parsed)).toEqual({ minimum: 10, maximum: 20 });
    expect(luckyNumberFormSchema.safeParse({ minimum: '10', maximum: '20', intent: 'generate', extra: true }).success).toBe(false);
  });

  it('stabil field error contractot képez', () => {
    const parsed = luckyNumberFormSchema.safeParse({ minimum: '20', maximum: '10', intent: 'generate' });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const mapped = mapLuckyNumberIssues(parsed.error);
    expect(mapped.fieldErrors.maximum?.[0]).toEqual(expect.objectContaining({
      code: 'FORM_CUSTOM',
      message: 'A maximum nem lehet kisebb a minimumnál.',
    }));
    expect(mapped.formErrors).toEqual([]);
  });
});
