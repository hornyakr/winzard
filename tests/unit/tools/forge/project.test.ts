import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { inspectSourceFile } from '../../../../tools/forge/checks/project';

const root = path.resolve('/virtual/winzard');

function inspect(projectFile: string, source: string) {
  return inspectSourceFile({
    root,
    filePath: path.join(root, ...projectFile.split('/')),
    source,
  });
}

describe('Forge architecture checks', () => {
  it('elutasítja az app réteg közvetlen ORM-importját', () => {
    const failures = inspect(
      'src/app/products/page.tsx',
      "import { db } from '@/platform/database/client'; export default function Page() { return null; }",
    );

    expect(failures).toContainEqual(expect.objectContaining({ code: 'APP_DIRECT_ORM_IMPORT' }));
  });

  it('elutasítja a szerveroldali saját API-hívást', () => {
    const failures = inspect(
      'src/app/products/page.tsx',
      "export default async function Page() { await fetch('/api/products'); return null; }",
    );

    expect(failures).toContainEqual(expect.objectContaining({ code: 'APP_INTERNAL_HTTP_CALL' }));
  });

  it('engedi a saját API-hívást explicit Client Componentben', () => {
    const failures = inspect(
      'src/app/products/product-client.tsx',
      "'use client'; export async function load() { return fetch('/api/products'); }",
    );

    expect(failures).toHaveLength(0);
  });

  it('elutasítja az application réteg Next.js- és infrastruktúra-függését', () => {
    const failures = inspect(
      'src/modules/catalog/product/application/queries/list-products.ts',
      "import { headers } from 'next/headers'; import { repository } from '../../infrastructure/repository';",
    );

    expect(failures.map(({ code }) => code)).toEqual(
      expect.arrayContaining(['APPLICATION_FRAMEWORK_IMPORT', 'APPLICATION_OUTWARD_IMPORT']),
    );
  });

  it('elutasítja a Client Component szerveroldali importját', () => {
    const failures = inspect(
      'src/modules/catalog/product/presentation/product-client.tsx',
      "'use client'; import { productModule } from '@/composition/catalog'; export function Product() { return null; }",
    );

    expect(failures).toContainEqual(expect.objectContaining({ code: 'CLIENT_SERVER_IMPORT' }));
  });

  it('server-only határt kér a composition roothoz és a Node adapterhez', () => {
    const compositionFailures = inspect(
      'src/composition/demo.ts',
      "export const demoModule = {};",
    );
    const adapterFailures = inspect(
      'src/modules/demo/lucky-number/infrastructure/random/node-adapter.ts',
      "import { randomInt } from 'node:crypto'; export const value = randomInt(10);",
    );

    expect(compositionFailures).toContainEqual(
      expect.objectContaining({ code: 'COMPOSITION_MISSING_SERVER_ONLY' }),
    );
    expect(adapterFailures).toContainEqual(
      expect.objectContaining({ code: 'NODE_ADAPTER_MISSING_SERVER_ONLY' }),
    );
  });

  it('elfogadja a kanonikus application és server-only adapter határokat', () => {
    const applicationFailures = inspect(
      'src/modules/demo/lucky-number/application/queries/get-lucky-number.ts',
      "import type { RandomIntegerGenerator } from '../ports/random-integer-generator'; export class Query {}",
    );
    const adapterFailures = inspect(
      'src/modules/demo/lucky-number/infrastructure/random/node-adapter.ts',
      "import 'server-only'; import { randomInt } from 'node:crypto'; export const value = randomInt(10);",
    );

    expect(applicationFailures).toHaveLength(0);
    expect(adapterFailures).toHaveLength(0);
  });
});
