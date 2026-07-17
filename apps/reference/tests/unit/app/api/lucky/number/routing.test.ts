import { describe, expect, it } from 'vitest';

import { POST } from '@/app/api/lucky/number/route';
import { GET as GET_RANGE } from '@/app/api/lucky/number/range/[minimum]/[maximum]/route';

describe('lucky-number routing adapters', () => {
  it('403 választ ad jogosulatlan POST kérésre', async () => {
    const response = await POST(new Request('http://localhost/api/lucky/number', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ minimum: 10, maximum: 20 }),
    }));
    expect(response.status).toBe(403);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('operator szerepkörrel validált POST választ ad', async () => {
    const response = await POST(new Request('http://localhost/api/lucky/number', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-demo-role': 'operator' },
      body: JSON.stringify({ minimum: 10, maximum: 20 }),
    }));
    const body = await response.json() as { value: number; minimum: number; maximum: number };
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ minimum: 10, maximum: 20 });
    expect(body.value).toBeGreaterThanOrEqual(10);
    expect(body.value).toBeLessThanOrEqual(20);
  });

  it('400 választ ad érvénytelen dinamikus paraméterre', async () => {
    const response = await GET_RANGE(new Request('http://localhost/api/lucky/number/range/x/20'), {
      params: Promise.resolve({ minimum: 'x', maximum: '20' }),
    });
    expect(response.status).toBe(400);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});
