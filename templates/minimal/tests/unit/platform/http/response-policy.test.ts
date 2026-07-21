import { describe, expect, it } from 'vitest';

import { applyResponsePolicy } from '@/platform/http/response-policy';

describe('response policy', () => {
  it('megőrzi a body streamet, és determinisztikus security/cache headereket ad', async () => {
    const original = new Response('payload', {
      status: 202,
      headers: { Vary: 'Accept-Encoding' },
    });
    const response = applyResponsePolicy(original, {
      policy: 'api-private',
      requestId: 'response-policy-test',
      vary: ['Origin', 'Accept-Encoding'],
    });

    expect(response.status).toBe(202);
    expect(await response.text()).toBe('payload');
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('X-Request-Id')).toBe('response-policy-test');
    expect(response.headers.get('Vary')).toBe('Accept-Encoding, Origin');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('elutasítja a body commit utáni response-módosítást', async () => {
    const response = new Response('payload');
    await response.text();

    expect(() => applyResponsePolicy(response, {
      policy: 'health',
      requestId: 'response-policy-test',
    })).toThrow(/before the response body is consumed/u);
  });
});
