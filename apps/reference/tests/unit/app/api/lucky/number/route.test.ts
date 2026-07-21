import { describe, expect, it } from 'vitest';

import { GET } from '@/app/api/lucky/number/route';

type LuckyNumberResponse = Readonly<{
  value: number;
  minimum: number;
  maximum: number;
}>;

describe('GET /api/lucky/number', () => {
  it('200-as, request-ID-val korrelált no-store JSON-választ ad', async () => {
    const response = await GET(
      new Request('http://localhost/api/lucky/number'),
      undefined,
    );
    const body = (await response.json()) as LuckyNumberResponse;

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('X-Request-Id')).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u);
    expect(body).toMatchObject({ minimum: 0, maximum: 100 });
    expect(Number.isSafeInteger(body.value)).toBe(true);
    expect(body.value).toBeGreaterThanOrEqual(body.minimum);
    expect(body.value).toBeLessThanOrEqual(body.maximum);
  });
});
