import { describe, expect, it } from 'vitest';

import {
  INTERNAL_LOCALE_HEADER,
  INTERNAL_PROXY_MARKER_HEADER,
  INTERNAL_REQUEST_ID_HEADER,
  INTERNAL_TENANT_HEADER,
} from '@/platform/http/internal-headers';
import {
  createRequestContextFromHeaders,
} from '@/platform/http/request-context.server';

describe('multi-request isolation', () => {
  it('nem szivárogtat request ID-t, tenantot vagy locale-t párhuzamos requestek között', async () => {
    const [first, second] = await Promise.all([
      createRequestContextFromHeaders(new Headers({
        [INTERNAL_PROXY_MARKER_HEADER]: '1',
        [INTERNAL_REQUEST_ID_HEADER]: 'request-a',
        [INTERNAL_TENANT_HEADER]: 'tenant-a',
        [INTERNAL_LOCALE_HEADER]: 'hu',
      })),
      createRequestContextFromHeaders(new Headers({
        [INTERNAL_PROXY_MARKER_HEADER]: '1',
        [INTERNAL_REQUEST_ID_HEADER]: 'request-b',
        [INTERNAL_TENANT_HEADER]: 'tenant-b',
        [INTERNAL_LOCALE_HEADER]: 'en',
      })),
    ]);

    expect(first).toMatchObject({ requestId: 'request-a', tenantId: 'tenant-a', locale: 'hu' });
    expect(second).toMatchObject({ requestId: 'request-b', tenantId: 'tenant-b', locale: 'en' });
    expect(first).not.toBe(second);
    expect(first.actor).not.toBe(second.actor);
  });
});
