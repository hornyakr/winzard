import { describe, expect, it } from 'vitest';

import { livenessRouteContract } from '@/app/api/health/live/route.contract';
import { readinessRouteContract } from '@/app/api/health/ready/route.contract';
import { homePageContract } from '@/app/page.contract';

describe('webapp HTTP-kernel contracts', () => {
  it('rögzíti a page és health delivery contractokat', () => {
    expect(homePageContract).toMatchObject({ id: 'webapp.home.page', route: '/' });
    expect(livenessRouteContract).toMatchObject({
      id: 'platform.health.live',
      route: '/api/health/live',
      responsePolicy: 'health',
    });
    expect(readinessRouteContract).toMatchObject({
      id: 'platform.health.ready',
      route: '/api/health/ready',
      responsePolicy: 'health',
    });
  });
});
