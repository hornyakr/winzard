import { beforeEach, describe, expect, it, vi } from 'vitest';

import { initialGenerateLuckyNumberActionState } from '@/modules/demo/lucky-number/presentation/lucky-number.action-state';
import { generateLuckyNumberAction } from '@/modules/demo/lucky-number/presentation/lucky-number.actions';

const { headersMock } = vi.hoisted(() => ({ headersMock: vi.fn() }));
vi.mock('next/headers', () => ({ headers: headersMock }));

describe('generateLuckyNumberAction', () => {
  beforeEach(() => {
    headersMock.mockResolvedValue(new Headers());
  });

  it('field errorokat ad invalid FormData esetén', async () => {
    const formData = new FormData();
    formData.set('minimum', '20');
    formData.set('maximum', '10');
    const result = await generateLuckyNumberAction(initialGenerateLuckyNumberActionState, formData);
    expect(result.ok).toBe(false);
    expect(result.fieldErrors?.maximum).toBeDefined();
  });

  it('minden hívásnál újra feloldja az aktort és tilt jogosultság nélkül', async () => {
    const formData = new FormData();
    formData.set('minimum', '10');
    formData.set('maximum', '20');
    const result = await generateLuckyNumberAction(initialGenerateLuckyNumberActionState, formData);
    expect(result).toMatchObject({ ok: false, formError: expect.stringContaining('operator') });
    expect(headersMock).toHaveBeenCalledOnce();
  });
});
