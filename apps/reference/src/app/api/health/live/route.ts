import { withRouteLifecycle } from '@/composition/http-kernel.server';

import { livenessRouteContract } from './route.contract';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withRouteLifecycle(
  livenessRouteContract,
  'GET',
  () => Response.json({ status: 'ok' }, { status: 200 }),
);
