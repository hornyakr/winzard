import { NextResponse, type NextRequest } from 'next/server';

import {
  INTERNAL_LOCALE_HEADER,
  INTERNAL_ORIGIN_HEADER,
  INTERNAL_PROXY_MARKER_HEADER,
  INTERNAL_REQUEST_HEADERS,
  INTERNAL_REQUEST_ID_HEADER,
} from './platform/http/internal-headers';

function canonicalOrigin(request: NextRequest): string {
  const configured = process.env.APP_URL?.trim();
  if (!configured) return request.nextUrl.origin;

  const url = new URL(configured);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username !== '' ||
    url.password !== '' ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new TypeError('APP_URL must be a credential-free HTTP(S) origin.');
  }
  return url.origin;
}

export function resolveProxyLocale(headers: Headers): 'hu' | 'en' {
  return (headers.get('accept-language') ?? '')
    .toLowerCase()
    .split(',')
    .some((value) => value.trim().startsWith('en'))
    ? 'en'
    : 'hu';
}

export function sanitizeProxyRequestHeaders(
  request: NextRequest,
  requestId: string,
): Headers {
  const headers = new Headers(request.headers);
  for (const name of INTERNAL_REQUEST_HEADERS) headers.delete(name);

  headers.set(INTERNAL_PROXY_MARKER_HEADER, '1');
  headers.set(INTERNAL_REQUEST_ID_HEADER, requestId);
  headers.set(INTERNAL_LOCALE_HEADER, resolveProxyLocale(headers));
  headers.set(INTERNAL_ORIGIN_HEADER, canonicalOrigin(request));
  return headers;
}

export function proxy(request: NextRequest): NextResponse {
  const requestId = crypto.randomUUID();
  const response = NextResponse.next({
    request: {
      headers: sanitizeProxyRequestHeaders(request, requestId),
    },
  });
  response.headers.set('X-Request-Id', requestId);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)'],
};
