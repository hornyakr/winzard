import { describe, expect, it } from 'vitest';
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

describe('Proxy request bridge', () => {
  it('felülír minden kliens által spoofolt belső headert', () => {
    const request = new NextRequest('https://public.example.test/products', {
      headers: {
        host: 'public.example.test',
        'accept-language': 'en-US,en;q=0.8',
        [INTERNAL_PROXY_MARKER_HEADER]: '1',
        [INTERNAL_REQUEST_ID_HEADER]: 'spoofed',
        [INTERNAL_TENANT_HEADER]: 'victim-tenant',
        [INTERNAL_LOCALE_HEADER]: 'hu',
        [INTERNAL_ORIGIN_HEADER]: 'https://attacker.invalid',
        'x-forwarded-for': '203.0.113.10',
        'x-winzard-ingress-peer': '10.0.0.3',
      },
    });

    const headers = sanitizeProxyRequestHeaders(request, 'trusted-request-id', {
      NODE_ENV: 'production',
      APP_STAGE: 'staging',
      APP_URL: 'https://app.example.test',
      LOG_LEVEL: 'error',
      TRUSTED_HOSTS: 'public.example.test,app.example.test',
      TRUSTED_PROXY_MODE: 'none',
      DEFAULT_LOCALE: 'hu',
      ENABLED_LOCALES: 'hu,en',
    });

    expect(headers.get(INTERNAL_PROXY_MARKER_HEADER)).toBe('1');
    expect(headers.get(INTERNAL_REQUEST_ID_HEADER)).toBe('trusted-request-id');
    expect(headers.get(INTERNAL_TENANT_HEADER)).toBeNull();
    expect(headers.get(INTERNAL_LOCALE_HEADER)).toBe('en');
    expect(headers.get(INTERNAL_ORIGIN_HEADER)).toBe('https://app.example.test');
    expect(headers.get('x-forwarded-for')).toBeNull();
    expect(headers.get('x-winzard-ingress-peer')).toBeNull();
  });


  it('trusted proxy módban csak out-of-band ingress peer értéket fogad el', () => {
    const request = new NextRequest('https://public.example.test/products', {
      headers: {
        host: 'public.example.test',
        'x-forwarded-for': '203.0.113.10',
        'x-winzard-ingress-peer': '10.0.0.3',
      },
    });
    const environment = {
      NODE_ENV: 'production',
      APP_STAGE: 'staging',
      APP_URL: 'https://app.example.test',
      LOG_LEVEL: 'error',
      TRUSTED_HOSTS: 'public.example.test,app.example.test',
      TRUSTED_PROXY_MODE: 'cidr',
      TRUSTED_PROXY_CIDRS: '10.0.0.0/8',
      DEFAULT_LOCALE: 'hu',
      ENABLED_LOCALES: 'hu,en',
    } as const;

    expect(() => sanitizeProxyRequestHeaders(
      request,
      'trusted-request-id',
      environment,
    )).toThrow(/ingress peer/u);

    const headers = sanitizeProxyRequestHeaders(
      request,
      'trusted-request-id',
      environment,
      { peerAddress: '10.0.0.3' },
    );
    expect(headers.get('x-winzard-client-ip')).toBe('203.0.113.10');
    expect(headers.get('x-winzard-ingress-peer')).toBeNull();
  });

  it('csak a támogatott locale enumra normalizál', () => {
    expect(resolveProxyLocale(new Headers({ 'accept-language': 'de-DE,hu;q=0.9' }))).toBe('hu');
    expect(resolveProxyLocale(new Headers({ 'accept-language': 'en-GB' }))).toBe('en');
  });
});
