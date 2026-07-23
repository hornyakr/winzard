import { describe, expect, it } from 'vitest';

import { catalogLabel } from '../../src/catalog';

describe('catalogLabel', () => {
  it('normalizes a catalog label', () => {
    expect(catalogLabel(' widget ')).toBe('WIDGET');
  });
});
