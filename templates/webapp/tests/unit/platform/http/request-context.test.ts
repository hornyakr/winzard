import { describe, expect, it } from 'vitest';

import {
  createRequestContextFactory,
  type RequestContextResolvers,
  type RequestContextSource,
} from '../../../../src/platform/http/request-context';

const resolvers: RequestContextResolvers = Object.freeze({
  requestId: Object.freeze({
    resolve: (source: RequestContextSource) => source.headers.get('x-request-id') ?? crypto.randomUUID(),
  }),
  actor: Object.freeze({
    resolve: (source: RequestContextSource) => {
      const userId = source.headers.get('x-user-id');
      return userId
        ? Object.freeze({
            kind: 'user' as const,
            userId,
            roles: Object.freeze([source.headers.get('x-role') ?? 'viewer']),
          })
        : Object.freeze({ kind: 'anonymous' as const });
    },
  }),
  tenant: Object.freeze({
    resolve: (source: RequestContextSource) => source.headers.get('x-tenant-id') ?? undefined,
  }),
  locale: Object.freeze({
    resolve: (source: RequestContextSource) => source.headers.get('x-locale') === 'en' ? 'en' : 'hu',
  }),
  traceId: Object.freeze({ resolve: () => undefined }),
  clientIp: Object.freeze({ resolve: () => undefined }),
  userAgent: Object.freeze({ resolve: () => undefined }),
  origin: Object.freeze({ resolve: () => undefined }),
});

describe('template RequestContext', () => {
  it('cross-request isolation alatt nem szivárogtat actor-, tenant-, locale- vagy request-ID állapotot', async () => {
    const createContext = createRequestContextFactory(resolvers);
    const [first, second] = await Promise.all([
      createContext({ headers: new Headers({
        'x-request-id': 'request-a',
        'x-user-id': 'user-a',
        'x-role': 'operator',
        'x-tenant-id': 'tenant-a',
        'x-locale': 'hu',
      }) }),
      createContext({ headers: new Headers({
        'x-request-id': 'request-b',
        'x-user-id': 'user-b',
        'x-role': 'viewer',
        'x-tenant-id': 'tenant-b',
        'x-locale': 'en',
      }) }),
    ]);

    expect(first).toMatchObject({
      requestId: 'request-a',
      actor: { kind: 'user', userId: 'user-a', roles: ['operator'] },
      tenantId: 'tenant-a',
      locale: 'hu',
    });
    expect(second).toMatchObject({
      requestId: 'request-b',
      actor: { kind: 'user', userId: 'user-b', roles: ['viewer'] },
      tenantId: 'tenant-b',
      locale: 'en',
    });
    expect(first.actor).not.toBe(second.actor);
  });
});
