import { beforeEach, describe, expect, it, vi } from 'vitest';

import { initialGenerateLuckyNumberActionState } from '@/modules/demo/lucky-number/presentation/lucky-number.action-state';
import { generateLuckyNumberAction } from '@/modules/demo/lucky-number/presentation/lucky-number.actions';

const { headersMock } = vi.hoisted(() => ({ headersMock: vi.fn() }));
vi.mock('next/headers', () => ({ headers: headersMock }));

describe('generateLuckyNumberAction', () => {
  beforeEach(() => {
    headersMock.mockReset();
    headersMock.mockResolvedValue(new Headers());
  });

  it('field errorokat ad invalid FormData esetén request-context feloldás nélkül', async () => {
    const formData = new FormData();
    formData.set('minimum', '20');
    formData.set('maximum', '10');
    formData.set('intent', 'generate');

    const result = await generateLuckyNumberAction(
      initialGenerateLuckyNumberActionState,
      formData,
    );

    expect(result.status).toBe('invalid');
    expect(result.fieldErrors.maximum).toBeDefined();
    expect(headersMock).not.toHaveBeenCalled();
  });

  it('minden érvényes hívásnál újra feloldja az aktort és tilt jogosultság nélkül', async () => {
    const formData = new FormData();
    formData.set('minimum', '10');
    formData.set('maximum', '20');
    formData.set('intent', 'generate');

    const result = await generateLuckyNumberAction(
      initialGenerateLuckyNumberActionState,
      formData,
    );

    expect(result.status).toBe('rejected');
    expect(result.formErrors).toContainEqual(expect.objectContaining({
      message: expect.stringContaining('operator'),
    }));
    expect(headersMock).toHaveBeenCalledOnce();
  });

  it('operator actorral stabil presenter DTO-t ad', async () => {
    headersMock.mockResolvedValue(new Headers({
      'x-demo-role': 'operator',
      'x-demo-subject': 'action-operator',
    }));
    const formData = new FormData();
    formData.set('minimum', '10');
    formData.set('maximum', '20');
    formData.set('intent', 'generate');

    const result = await generateLuckyNumberAction(
      initialGenerateLuckyNumberActionState,
      formData,
    );

    expect(result.status).toBe('success');
    if (result.status !== 'success') throw new TypeError('Sikeres action state szükséges.');
    expect(result.result).toMatchObject({ minimum: 10, maximum: 20 });
    expect(result.result.value).toBeGreaterThanOrEqual(10);
    expect(result.result.value).toBeLessThanOrEqual(20);
    expect(headersMock).toHaveBeenCalledOnce();
  });
});
