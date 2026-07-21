import { describe, expect, it } from 'vitest';

import { POST } from '@/app/api/lucky/number/route';
import { GET as GET_RANGE } from '@/app/api/lucky/number/range/[minimum]/[maximum]/route';

function mutationHeaders(input: Readonly<Record<string, string>> = {}): HeadersInit {
  return {
    'content-type': 'application/json',
    origin: 'http://localhost',
    'sec-fetch-site': 'same-origin',
    ...input,
  };
}

describe('lucky-number delivery adapters', () => {
  it('403 Problem Details választ ad jogosulatlan POST kérésre', async () => {
    const response = await POST(new Request('http://localhost/api/lucky/number', {
      method: 'POST',
      headers: mutationHeaders(),
      body: JSON.stringify({ minimum: 10, maximum: 20 }),
    }), undefined);
    const body = await response.json() as { code: string; requestId: string };

    expect(response.status).toBe(403);
    expect(response.headers.get('content-type')).toContain('application/problem+json');
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('X-Request-Id')).toBe(body.requestId);
    expect(body.code).toBe('FORBIDDEN');
  });

  it('403 választ ad hiányzó vagy idegen Origin esetén', async () => {
    const missing = await POST(new Request('http://localhost/api/lucky/number', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-demo-role': 'operator' },
      body: JSON.stringify({ minimum: 10, maximum: 20 }),
    }), undefined);
    const foreign = await POST(new Request('http://localhost/api/lucky/number', {
      method: 'POST',
      headers: mutationHeaders({
        origin: 'https://attacker.invalid',
        'x-demo-role': 'operator',
      }),
      body: JSON.stringify({ minimum: 10, maximum: 20 }),
    }), undefined);

    expect(missing.status).toBe(403);
    expect(foreign.status).toBe(403);
  });

  it('415 választ ad nem támogatott médiatípusra', async () => {
    const response = await POST(new Request('http://localhost/api/lucky/number', {
      method: 'POST',
      headers: mutationHeaders({
        'content-type': 'text/plain',
        'x-demo-role': 'operator',
      }),
      body: 'minimum=10&maximum=20',
    }), undefined);
    expect(response.status).toBe(415);
  });

  it('400 választ ad malformed JSON-ra', async () => {
    const response = await POST(new Request('http://localhost/api/lucky/number', {
      method: 'POST',
      headers: mutationHeaders({ 'x-demo-role': 'operator' }),
      body: '{',
    }), undefined);
    expect(response.status).toBe(400);
  });

  it('413 választ ad a contract body-limitjét meghaladó kérésre', async () => {
    const response = await POST(new Request('http://localhost/api/lucky/number', {
      method: 'POST',
      headers: mutationHeaders({
        'content-length': '20000',
        'x-demo-role': 'operator',
      }),
      body: JSON.stringify({ minimum: 10, maximum: 20 }),
    }), undefined);

    expect(response.status).toBe(413);
  });

  it('422 stabil validációs problem contractot ad', async () => {
    const response = await POST(new Request('http://localhost/api/lucky/number', {
      method: 'POST',
      headers: mutationHeaders({ 'x-demo-role': 'operator' }),
      body: JSON.stringify({ minimum: 20, maximum: 10 }),
    }), undefined);
    const body = await response.json() as {
      code: string;
      requestId: string;
      errors: Array<{ path: string; code: string }>;
    };
    expect(response.status).toBe(422);
    expect(body.code).toBe('INVALID_RANGE');
    expect(response.headers.get('X-Request-Id')).toBe(body.requestId);
    expect(body.errors).toContainEqual(expect.objectContaining({ path: 'maximum' }));
  });

  it('operator szerepkörrel explicit presenter DTO-t ad', async () => {
    const response = await POST(new Request('http://localhost/api/lucky/number', {
      method: 'POST',
      headers: mutationHeaders({
        'x-demo-role': 'operator',
        'x-demo-subject': 'unit-operator',
      }),
      body: JSON.stringify({ minimum: 10, maximum: 20 }),
    }), undefined);
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
    const body = await response.json() as { requestId: string };
    expect(response.status).toBe(400);
    expect(response.headers.get('content-type')).toContain('application/problem+json');
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('X-Request-Id')).toBe(body.requestId);
  });
});
