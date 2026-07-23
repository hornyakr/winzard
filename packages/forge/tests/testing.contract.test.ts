import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildTestingInventory,
  impactedTestingSuites,
  inspectTestingSuites,
} from '../src/testing/inventory';

const fixtureRoot = path.join(
  process.cwd(),
  'packages/forge/tests/fixtures/testing-project',
);

describe('testing platform contract', () => {
  it('builds a deterministic suite inventory', async () => {
    const first = await buildTestingInventory(fixtureRoot);
    const second = await buildTestingInventory(fixtureRoot);

    expect(first.issues.filter(({ severity }) => severity === 'error')).toEqual([]);
    expect(first.suites.map(({ id }) => id)).toEqual([
      'catalog.unit',
      'catalog.http',
    ]);
    expect(first.suites[0]?.discoveredFiles).toEqual([
      'tests/unit/catalog.test.ts',
    ]);
    expect(first.suites[1]?.discoveredFiles).toEqual([
      'tests/e2e/catalog.smoke.ts',
    ]);
    expect(first.fingerprint).toBe(second.fingerprint);
  });

  it('inspects suites by owner and selects impacted suites conservatively', async () => {
    const inventory = await buildTestingInventory(fixtureRoot);

    expect(inspectTestingSuites(inventory, 'team:catalog')).toHaveLength(2);
    expect(
      impactedTestingSuites(inventory, ['src/catalog.ts']).map(({ id }) => id),
    ).toEqual(['catalog.unit', 'catalog.http']);
    expect(
      impactedTestingSuites(inventory, ['unknown/file.md']).map(({ id }) => id),
    ).toEqual(['catalog.unit', 'catalog.http']);
  });
});
