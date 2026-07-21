import { describe, expect, it } from 'vitest';

import { homePageContract } from '@/app/page.contract';

describe('minimal HTTP-kernel contracts', () => {
  it('rögzíti a publikus kezdőoldal delivery contractját', () => {
    expect(homePageContract).toMatchObject({
      id: 'minimal.home.page',
      route: '/',
      methods: ['GET'],
      authentication: 'public',
    });
  });
});
