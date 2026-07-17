import { describe, expect, it } from 'vitest';

import { GET } from '@/app/api/lucky/number/route';

type LuckyNumberResponse = Readonly<{
  value: number;
  minimum: number;
  maximum: number;
}>;

describe('GET /api/lucky/number', () => {
  it('200-as, no-store JSON-választ ad érvényes tartománnyal', async () => {
    const response = GET();
    const body = (await response.json()) as LuckyNumberResponse;

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body).toMatchObject({ minimum: 0, maximum: 100 });
    expect(Number.isSafeInteger(body.value)).toBe(true);
    expect(body.value).toBeGreaterThanOrEqual(body.minimum);
    expect(body.value).toBeLessThanOrEqual(body.maximum);
  });
});
