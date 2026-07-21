import { withRouteLifecycle } from '@/composition/http-kernel.server';
import { assertDatabaseReady } from '@/platform/database/readiness';

import { readinessRouteContract } from './route.contract';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withRouteLifecycle(
  readinessRouteContract,
  'GET',
  async () => {
    try {
      await assertDatabaseReady();
      return Response.json({ status: 'ok' }, { status: 200 });
    } catch {
      return Response.json({ status: 'unavailable' }, { status: 503 });
    }
  },
);
