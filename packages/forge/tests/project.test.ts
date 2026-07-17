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
});
