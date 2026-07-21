import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

import {
  INTERNAL_LOCALE_HEADER,
  INTERNAL_ORIGIN_HEADER,
  INTERNAL_PROXY_MARKER_HEADER,
  INTERNAL_REQUEST_ID_HEADER,
  INTERNAL_TENANT_HEADER,
} from '@/platform/http/internal-headers';
import {
  resolveProxyLocale,
  sanitizeProxyRequestHeaders,
} from '@/proxy';

const originalAppUrl = process.env.APP_URL;

afterEach(() => {
  if (originalAppUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = originalAppUrl;
});

describe('Proxy request bridge', () => {
  it('felülír minden kliens által spoofolt belső headert', () => {
    process.env.APP_URL = 'https://app.example.test';
    const request = new NextRequest('https://public.example.test/products', {
      headers: {
        'accept-language': 'en-US,en;q=0.8',
        [INTERNAL_PROXY_MARKER_HEADER]: '1',
        [INTERNAL_REQUEST_ID_HEADER]: 'spoofed',
        [INTERNAL_TENANT_HEADER]: 'victim-tenant',
        [INTERNAL_LOCALE_HEADER]: 'hu',
        [INTERNAL_ORIGIN_HEADER]: 'https://attacker.invalid',
      },
    });

    const headers = sanitizeProxyRequestHeaders(request, 'trusted-request-id');

    expect(headers.get(INTERNAL_PROXY_MARKER_HEADER)).toBe('1');
    expect(headers.get(INTERNAL_REQUEST_ID_HEADER)).toBe('trusted-request-id');
    expect(headers.get(INTERNAL_TENANT_HEADER)).toBeNull();
    expect(headers.get(INTERNAL_LOCALE_HEADER)).toBe('en');
    expect(headers.get(INTERNAL_ORIGIN_HEADER)).toBe('https://app.example.test');
  });

  it('csak a támogatott locale enumra normalizál', () => {
    expect(resolveProxyLocale(new Headers({ 'accept-language': 'de-DE,hu;q=0.9' }))).toBe('hu');
    expect(resolveProxyLocale(new Headers({ 'accept-language': 'en-GB' }))).toBe('en');
  });
});
