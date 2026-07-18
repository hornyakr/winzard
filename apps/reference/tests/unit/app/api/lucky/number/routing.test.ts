import { describe, expect, it } from 'vitest';

import { POST } from '@/app/api/lucky/number/route';
import { GET as GET_RANGE } from '@/app/api/lucky/number/range/[minimum]/[maximum]/route';

describe('lucky-number delivery adapters', () => {
  it('403 Problem Details választ ad jogosulatlan POST kérésre', async () => {
    const response = await POST(new Request('http://localhost/api/lucky/number', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ minimum: 10, maximum: 20 }),
    }));
    expect(response.status).toBe(403);
    expect(response.headers.get('content-type')).toContain('application/problem+json');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('415 választ ad nem támogatott médiatípusra', async () => {
    const response = await POST(new Request('http://localhost/api/lucky/number', {
      method: 'POST',
      headers: { 'content-type': 'text/plain', 'x-demo-role': 'operator' },
      body: 'minimum=10&maximum=20',
    }));
    expect(response.status).toBe(415);
  });

  it('400 választ ad malformed JSON-ra', async () => {
    const response = await POST(new Request('http://localhost/api/lucky/number', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-demo-role': 'operator' },
      body: '{',
    }));
    expect(response.status).toBe(400);
  });

  it('422 stabil validációs problem contractot ad', async () => {
    const response = await POST(new Request('http://localhost/api/lucky/number', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-demo-role': 'operator' },
      body: JSON.stringify({ minimum: 20, maximum: 10 }),
    }));
    const body = await response.json() as { code: string; errors: Array<{ path: string; code: string }> };
    expect(response.status).toBe(422);
    expect(body.code).toBe('INVALID_RANGE');
    expect(body.errors).toContainEqual(expect.objectContaining({ path: 'maximum' }));
  });

  it('operator szerepkörrel explicit presenter DTO-t ad', async () => {
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
    expect(response.headers.get('content-type')).toContain('application/problem+json');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});
