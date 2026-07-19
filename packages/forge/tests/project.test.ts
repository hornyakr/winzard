import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { inspectSourceFile, runProjectChecks } from '../src/checks/project';

const virtualRoot = path.resolve('/virtual/winzard');
function inspect(projectFile: string, source: string) {
  return inspectSourceFile({ root: virtualRoot, filePath: path.join(virtualRoot, ...projectFile.split('/')), source });
}

async function fixture(manifest: object): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'winzard-forge-'));
  await writeFile(path.join(root, 'winzard.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const capabilities = new Set(
    Array.isArray((manifest as { capabilities?: unknown }).capabilities)
      ? (manifest as { capabilities: string[] }).capabilities
      : [],
  );
  if (capabilities.has('next-app')) {
    const lines = [
      'APP_URL=http://localhost:3000',
      'APP_NAME=Test',
      'APP_STAGE=local',
      'LOG_LEVEL=error',
      'NEXT_PUBLIC_APP_NAME=Test',
    ];
    if (capabilities.has('prisma-postgresql')) lines.push(
      'DATABASE_URL=postgresql://user:password@localhost:5432/test',
      'DATABASE_POOL_MAX=10',
      'DATABASE_CONNECTION_TIMEOUT_MS=5000',
    );
    if (capabilities.has('authentication')) lines.push(
      'AUTH_SECRET=<generate-at-least-32-random-characters>',
    );
    await writeFile(path.join(root, '.env.example'), `${lines.join('\n')}\n`);
  }
  return root;
}

async function file(root: string, projectPath: string, content = ''): Promise<void> {
  const target = path.join(root, projectPath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
}

describe('Forge capability checks', () => {
  it('a minimal profilhoz nem követel Prisma, health vagy dokumentációs útvonalat', async () => {
    const root = await fixture({ schemaVersion: 1, profile: 'minimal', capabilities: ['next-app', 'forge'] });
    await mkdir(path.join(root, 'src/app'), { recursive: true });
    await file(root, 'next.config.ts', 'export default {};');
    await file(root, 'tsconfig.json', '{}');

    expect(await runProjectChecks(root)).toHaveLength(0);
  });

  it('csak capability mellett követeli a Prisma fájlokat', async () => {
    const root = await fixture({ schemaVersion: 1, profile: 'webapp', capabilities: ['next-app', 'forge', 'prisma-postgresql'] });
    await mkdir(path.join(root, 'src/app'), { recursive: true });
    await file(root, 'next.config.ts', 'export default {};');
    await file(root, 'tsconfig.json', '{}');

    const codes = (await runProjectChecks(root)).map(({ code }) => code);
    expect(codes).toContain('CAPABILITY_PATH_MISSING');
  });


  it('a presentation-contract capability a view architecture checkeket is bekapcsolja', async () => {
    const root = await fixture({
      schemaVersion: 1,
      profile: 'minimal',
      capabilities: ['next-app', 'forge', 'presentation-contract'],
    });
    await file(root, 'next.config.ts', 'export default {};');
    await file(root, 'tsconfig.json', '{}');
    await file(root, 'src/app/page.tsx', 'export default function Page() { return <img src="/logo.png" />; }');

    expect(await runProjectChecks(root)).toContainEqual(expect.objectContaining({ code: 'VIEW_MISSING_IMAGE_ALT' }));
  });

  it('érvényesíti az infrastruktúra capability-függőségeket', async () => {
    const root = await fixture({ schemaVersion: 1, profile: 'invalid', capabilities: ['database-readiness'] });
    const failures = await runProjectChecks(root);
    expect(failures).toContainEqual(expect.objectContaining({ code: 'CAPABILITY_DEPENDENCY_MISSING' }));
  });

  it('az ai-delivery capabilityhez project-documentation szükséges', async () => {
    const root = await fixture({
      schemaVersion: 1,
      profile: 'invalid',
      capabilities: ['forge', 'ai-delivery'],
      documentation: {
        contractVersion: 1,
        projectPrefix: 'ATLAS',
        consumerContractVersion: '0.1.0',
      },
    });
    const failures = await runProjectChecks(root);
    expect(failures).toContainEqual(expect.objectContaining({ code: 'CAPABILITY_DEPENDENCY_MISSING' }));
  });

  it('a project-documentation capability dokumentációs manifestet igényel', async () => {
    const root = await fixture({ schemaVersion: 1, profile: 'invalid', capabilities: ['forge', 'project-documentation'] });
    const failures = await runProjectChecks(root);
    expect(failures).toContainEqual(expect.objectContaining({ code: 'DOCUMENTATION_MANIFEST_MISSING' }));
  });

  it('elutasítja a Prisma Config eager env helperét', async () => {
    const root = await fixture({ schemaVersion: 1, profile: 'webapp', capabilities: ['prisma-postgresql'] });
    await file(root, 'prisma/schema.prisma', 'datasource db { provider = "postgresql" }');
    await file(root, 'src/platform/database/database-env.server.ts', 'export {};');
    await file(root, 'prisma.config.ts', `import { env } from 'prisma/config'; export default { datasource: { url: env('DATABASE_URL') } };`);

    expect(await runProjectChecks(root)).toContainEqual(expect.objectContaining({ code: 'PRISMA_CONFIG_EAGER_DATABASE_URL' }));
  });
});

describe('Forge architecture checks', () => {
  it('elutasítja az app réteg közvetlen ORM-importját', () => {
    expect(inspect('src/app/products/page.tsx', "import { db } from '@/platform/database/client';")).toContainEqual(expect.objectContaining({ code: 'APP_DIRECT_ORM_IMPORT' }));
  });

  it('elutasítja a szerveroldali saját API-hívást', () => {
    expect(inspect('src/app/products/page.tsx', "export async function Page() { await fetch('/api/products'); }")).toContainEqual(expect.objectContaining({ code: 'APP_INTERNAL_HTTP_CALL' }));
  });

  it('elutasítja az application réteg kifelé mutató függését', () => {
    const failures = inspect('src/modules/catalog/application/query.ts', "import { headers } from 'next/headers'; import { repo } from '../infrastructure/repo';");
    expect(failures.map(({ code }) => code)).toEqual(expect.arrayContaining(['APPLICATION_FRAMEWORK_IMPORT', 'APPLICATION_OUTWARD_IMPORT']));
  });

  it('server-only határt kér a composition roothoz és a Node adapterhez', () => {
    expect(inspect('src/composition/demo.ts', 'export const demo = {};')).toContainEqual(expect.objectContaining({ code: 'COMPOSITION_MISSING_SERVER_ONLY' }));
    expect(inspect('src/modules/demo/infrastructure/node.ts', "import { randomInt } from 'node:crypto';")).toContainEqual(expect.objectContaining({ code: 'NODE_ADAPTER_MISSING_SERVER_ONLY' }));
  });


  it('elutasítja a domain/application env hozzáférést és a kliensoldali server envet', () => {
    expect(inspect('src/modules/catalog/domain/policy.ts', 'export const value = process.env.APP_STAGE;')).toContainEqual(
      expect.objectContaining({ code: 'CONFIG_PROCESS_ENV_FORBIDDEN' }),
    );
    expect(inspect('src/app/client.tsx', "'use client'; export const value = process.env.AUTH_SECRET;")).toContainEqual(
      expect.objectContaining({ code: 'CONFIG_CLIENT_SERVER_ENV' }),
    );
  });

  it('elutasítja a kliensoldali dinamikus env hozzáférést', () => {
    const failures = inspect(
      'src/app/client.tsx',
      "'use client'; const key = 'AUTH_SECRET'; export const value = process.env[key];",
    );
    expect(failures).toContainEqual(expect.objectContaining({ code: 'CONFIG_CLIENT_DYNAMIC_ENV' }));
  });

  it('explicit server-only határt kér a process.env-et olvasó config modulhoz', () => {
    const failures = inspect(
      'src/platform/config/app-env.ts',
      'export const name = process.env.APP_NAME;',
    );
    expect(failures).toContainEqual(expect.objectContaining({ code: 'CONFIG_SERVER_BOUNDARY_MISSING' }));
  });

  it('elutasítja a globális env baget és a teljes env naplózását', () => {
    const failures = inspect(
      'src/platform/config/environment.ts',
      ['export const environment = schema.parse(process.', 'env); console.log(process.', 'env);'].join(''),
    );
    expect(failures.map(({ code }) => code)).toEqual(expect.arrayContaining([
      'CONFIG_GLOBAL_BAG_FORBIDDEN',
      'CONFIG_RAW_ENV_LOG',
    ]));
  });
});
