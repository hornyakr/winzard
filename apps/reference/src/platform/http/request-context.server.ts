import 'server-only';

import { headers as nextHeaders } from 'next/headers';

import type { ApplicationActor, ApplicationLocale } from '@/application/application-context';

import {
  INTERNAL_CLIENT_IP_HEADER,
  INTERNAL_LOCALE_HEADER,
  INTERNAL_ORIGIN_HEADER,
  INTERNAL_PROXY_MARKER_HEADER,
  INTERNAL_REQUEST_ID_HEADER,
  INTERNAL_TENANT_HEADER,
} from './internal-headers';
import {
  createRequestContextFactory,
  type ActorResolver,
  type LocaleResolver,
  type OptionalRequestMetadataResolver,
  type RequestContext,
  type RequestContextResolvers,
  type RequestContextSource,
  type RequestIdResolver,
  type TenantResolver,
} from './request-context';

export { createRequestContextFactory, toApplicationContext } from './request-context';
export type {
  ActorResolver,
  LocaleResolver,
  OptionalRequestMetadataResolver,
  RequestContext,
  RequestContextResolvers,
  RequestContextSource,
  RequestIdResolver,
  TenantResolver,
} from './request-context';

const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const TENANT_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/u;
const TRACEPARENT = /^00-([0-9a-f]{32})-[0-9a-f]{16}-[0-9a-f]{2}$/u;

function trustedProxy(source: RequestContextSource): boolean {
  return source.headers.get(INTERNAL_PROXY_MARKER_HEADER) === '1';
}

function validHeader(
  source: RequestContextSource,
  name: string,
  pattern: RegExp,
): string | undefined {
  const value = source.headers.get(name)?.trim();
  return value && pattern.test(value) ? value : undefined;
}

function safeSingleLine(value: string | null, maximum: number): string | undefined {
  const normalized = value?.replace(/[\r\n\u0000-\u001f\u007f]/gu, '').trim();
  return normalized ? normalized.slice(0, maximum) : undefined;
}

const requestIdResolver: RequestIdResolver = Object.freeze({
  resolve(source: RequestContextSource) {
    if (trustedProxy(source)) {
      const trusted = validHeader(source, INTERNAL_REQUEST_ID_HEADER, REQUEST_ID);
      if (trusted) return trusted;
    }
    return crypto.randomUUID();
  },
});

export const anonymousActorResolver: ActorResolver = Object.freeze({
  resolve(): ApplicationActor {
    return Object.freeze({ kind: 'anonymous' });
  },
});

const tenantResolver: TenantResolver = Object.freeze({
  resolve(source: RequestContextSource) {
    return trustedProxy(source)
      ? validHeader(source, INTERNAL_TENANT_HEADER, TENANT_ID)
      : undefined;
  },
});

const localeResolver: LocaleResolver = Object.freeze({
  resolve(source: RequestContextSource): ApplicationLocale {
    if (trustedProxy(source)) {
      const internal = source.headers.get(INTERNAL_LOCALE_HEADER)?.trim().toLowerCase();
      if (internal === 'hu' || internal === 'en') return internal;
    }
    const accepted = source.headers.get('accept-language')?.toLowerCase() ?? '';
    return accepted.split(',').some((part: string) => part.trim().startsWith('en')) ? 'en' : 'hu';
  },
});

const traceIdResolver: OptionalRequestMetadataResolver = Object.freeze({
  resolve(source: RequestContextSource) {
    const traceparent = source.headers.get('traceparent')?.trim().toLowerCase();
    return traceparent?.match(TRACEPARENT)?.[1];
  },
});

const clientIpResolver: OptionalRequestMetadataResolver = Object.freeze({
  resolve(source: RequestContextSource) {
    return trustedProxy(source)
      ? safeSingleLine(source.headers.get(INTERNAL_CLIENT_IP_HEADER), 64)
      : undefined;
  },
});

const userAgentResolver: OptionalRequestMetadataResolver = Object.freeze({
  resolve(source: RequestContextSource) {
    return safeSingleLine(source.headers.get('user-agent'), 512);
  },
});

const originResolver: OptionalRequestMetadataResolver = Object.freeze({
  resolve(source: RequestContextSource) {
    if (!trustedProxy(source)) return undefined;
    const value = source.headers.get(INTERNAL_ORIGIN_HEADER);
    if (!value) return undefined;
    try {
      const url = new URL(value);
      return url.origin === value ? value : undefined;
    } catch {
      return undefined;
    }
  },
});

export function defaultRequestContextResolvers(
  actor: ActorResolver = anonymousActorResolver,
): RequestContextResolvers {
  return Object.freeze({
    requestId: requestIdResolver,
    actor,
    tenant: tenantResolver,
    locale: localeResolver,
    traceId: traceIdResolver,
    clientIp: clientIpResolver,
    userAgent: userAgentResolver,
    origin: originResolver,
  });
}

const createDefaultRequestContext = createRequestContextFactory(
  defaultRequestContextResolvers(),
);

export function routeContextSource(request: Request): RequestContextSource {
  return Object.freeze({
    headers: request.headers,
    url: request.url,
  });
}

export async function nextRequestContextSource(): Promise<RequestContextSource> {
  return Object.freeze({
    headers: new Headers(await nextHeaders()),
  });
}

export async function createRequestContextFromHeaders(
  input: Headers,
  receivedAt = new Date(),
  actor: ActorResolver = anonymousActorResolver,
): Promise<RequestContext> {
  return createRequestContextFactory(defaultRequestContextResolvers(actor))({
    headers: input,
    receivedAt,
  });
}

export function createRouteRequestContext(request: Request): Promise<RequestContext> {
  return createDefaultRequestContext(routeContextSource(request));
}
