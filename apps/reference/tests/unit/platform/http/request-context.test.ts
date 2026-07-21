import { describe, expect, it } from 'vitest';

import {
  INTERNAL_LOCALE_HEADER,
  INTERNAL_PROXY_MARKER_HEADER,
  INTERNAL_REQUEST_ID_HEADER,
  INTERNAL_TENANT_HEADER,
} from '@/platform/http/internal-headers';
import {
  createRequestContextFromHeaders,
  defaultRequestContextResolvers,
} from '@/platform/http/request-context.server';
import {
  createRequestContextFactory,
  toApplicationContext,
  type ActorResolver,
  type RequestContextSource,
} from '@/platform/http/request-context';

const headerActorResolver: ActorResolver = Object.freeze({
  resolve(source: RequestContextSource) {
    const userId = source.headers.get('x-test-user');
    return userId
      ? Object.freeze({
          kind: 'user' as const,
          userId,
          roles: Object.freeze([source.headers.get('x-test-role') ?? 'viewer']),
        })
      : Object.freeze({ kind: 'anonymous' as const });
  },
});

describe('RequestContext', () => {
  it('csak a Proxy-markerrel együtt bízik a belső headerekben', async () => {
    const spoofed = await createRequestContextFromHeaders(new Headers({
      [INTERNAL_REQUEST_ID_HEADER]: 'spoofed-request-id',
      [INTERNAL_TENANT_HEADER]: 'spoofed-tenant',
      [INTERNAL_LOCALE_HEADER]: 'en',
    }), new Date('2026-07-21T10:00:00.000Z'));
    const trusted = await createRequestContextFromHeaders(new Headers({
      [INTERNAL_PROXY_MARKER_HEADER]: '1',
      [INTERNAL_REQUEST_ID_HEADER]: 'trusted-request-id',
      [INTERNAL_TENANT_HEADER]: 'tenant-a',
      [INTERNAL_LOCALE_HEADER]: 'en',
    }), new Date('2026-07-21T10:00:00.000Z'));

    expect(spoofed.requestId).not.toBe('spoofed-request-id');
    expect(spoofed.tenantId).toBeUndefined();
    expect(trusted).toMatchObject({
      requestId: 'trusted-request-id',
      tenantId: 'tenant-a',
      locale: 'en',
      receivedAt: '2026-07-21T10:00:00.000Z',
    });
    expect(Object.isFrozen(trusted)).toBe(true);
  });

  it('cross-request isolation: párhuzamos requestek aktorát, tenantját, locale-ját és request ID-ját izolálja', async () => {
    const factory = createRequestContextFactory(
      defaultRequestContextResolvers(headerActorResolver),
    );
    const [first, second] = await Promise.all([
      factory({ headers: new Headers({
        [INTERNAL_PROXY_MARKER_HEADER]: '1',
        [INTERNAL_REQUEST_ID_HEADER]: 'request-a',
        [INTERNAL_TENANT_HEADER]: 'tenant-a',
        [INTERNAL_LOCALE_HEADER]: 'hu',
        'x-test-user': 'user-a',
        'x-test-role': 'operator',
      }) }),
      factory({ headers: new Headers({
        [INTERNAL_PROXY_MARKER_HEADER]: '1',
        [INTERNAL_REQUEST_ID_HEADER]: 'request-b',
        [INTERNAL_TENANT_HEADER]: 'tenant-b',
        [INTERNAL_LOCALE_HEADER]: 'en',
        'x-test-user': 'user-b',
        'x-test-role': 'viewer',
      }) }),
    ]);

    expect(first).toMatchObject({
      requestId: 'request-a',
      tenantId: 'tenant-a',
      locale: 'hu',
      actor: { kind: 'user', userId: 'user-a', roles: ['operator'] },
    });
    expect(second).toMatchObject({
      requestId: 'request-b',
      tenantId: 'tenant-b',
      locale: 'en',
      actor: { kind: 'user', userId: 'user-b', roles: ['viewer'] },
    });
    expect(first.actor).not.toBe(second.actor);
    expect(Object.isFrozen(first.actor)).toBe(true);
    expect(Object.isFrozen((first.actor as { roles: readonly string[] }).roles)).toBe(true);
    expect(toApplicationContext(first)).toEqual({
      actor: first.actor,
      tenantId: 'tenant-a',
      requestId: 'request-a',
      locale: 'hu',
    });
  });
});
