import { NextResponse, type NextRequest } from 'next/server';

import {
  INTERNAL_CLIENT_IP_HEADER,
  INTERNAL_LOCALE_HEADER,
  INTERNAL_ORIGIN_HEADER,
  INTERNAL_PROXY_MARKER_HEADER,
  INTERNAL_REQUEST_HEADERS,
  INTERNAL_REQUEST_ID_HEADER,
} from './platform/kernel-config/internal-headers';
import { assertTrustedHost, createHostPolicy } from './platform/kernel-config/host-policy';
import {
  createLocaleConfiguration,
  resolveAcceptLanguage,
} from './platform/kernel-config/locale-config';
import {
  createProxyTrustPolicy,
  forwardedRequestHeaders,
  resolveClientAddress,
} from './platform/kernel-config/proxy-trust';
import { createRuntimeEnvironment } from './platform/kernel-config/runtime-environment';

const UNTRUSTED_INGRESS_PEER_HEADER = 'x-winzard-ingress-peer';

export function resolveProxyLocale(
  headers: Headers,
  environment: NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>> = process.env,
) {
  return resolveAcceptLanguage(
    headers.get('accept-language'),
    createLocaleConfiguration(environment),
  );
}

export function sanitizeProxyRequestHeaders(
  request: NextRequest,
  requestId: string,
  environment: NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>> = process.env,
  ingress: Readonly<{ peerAddress?: string }> = {},
): Headers {
  const runtime = createRuntimeEnvironment(environment);
  const hostPolicy = createHostPolicy(environment, runtime.stage);
  assertTrustedHost(request.headers.get('host'), hostPolicy);

  const headers = new Headers(request.headers);
  const clientAddress = resolveClientAddress({
    headers,
    ...(ingress.peerAddress ? { peerAddress: ingress.peerAddress } : {}),
    policy: createProxyTrustPolicy(environment),
  });

  for (const name of INTERNAL_REQUEST_HEADERS) headers.delete(name);
  for (const name of forwardedRequestHeaders) headers.delete(name);
  headers.delete(UNTRUSTED_INGRESS_PEER_HEADER);

  headers.set(INTERNAL_PROXY_MARKER_HEADER, '1');
  headers.set(INTERNAL_REQUEST_ID_HEADER, requestId);
  headers.set(INTERNAL_LOCALE_HEADER, resolveProxyLocale(request.headers, environment));
  headers.set(INTERNAL_ORIGIN_HEADER, hostPolicy.canonicalOrigin.origin);
  if (clientAddress) headers.set(INTERNAL_CLIENT_IP_HEADER, clientAddress);
  return headers;
}

export function proxy(request: NextRequest): NextResponse {
  const requestId = crypto.randomUUID();
  try {
    const response = NextResponse.next({
      request: {
        headers: sanitizeProxyRequestHeaders(request, requestId),
      },
    });
    response.headers.set('X-Request-Id', requestId);
    response.headers.set('X-Content-Type-Options', 'nosniff');
    return response;
  } catch {
    return new NextResponse('Bad Request', {
      status: 400,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        'X-Request-Id': requestId,
      },
    });
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)'],
};
