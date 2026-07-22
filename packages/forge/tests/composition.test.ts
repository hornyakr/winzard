import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { checkCompositionDocumentation, generateCompositionDocumentation } from '../src/composition/docs';
import { checkCompositionGeneration, generateComposition } from '../src/composition/generator';
import { buildCompositionInventory, compositionWhy } from '../src/composition/inventory';

async function file(root: string, target: string, content: string): Promise<void> {
  const absolute = path.join(root, target);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, content, 'utf8');
}

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'winzard-composition-'));
  await file(root, 'src/composition/app.server.ts', "import 'server-only'; export const application = {};\n");
  await file(root, 'src/modules/catalog/application/query.ts', 'export class Query {}\n');
  await file(root, 'src/modules/catalog/infrastructure/repository.ts', 'export class Repository {}\n');
  await file(root, 'src/composition/catalog.composition.definition.ts', `
export const catalog = defineComposition({
  schemaVersion: 1,
  id: 'catalog',
  capability: 'service-composition',
  roots: [{ id: 'catalog.root', source: 'src/composition/app.server.ts', export: 'application', runtime: 'nodejs', services: ['catalog.query'] }],
  services: [
    { id: 'catalog.repository', kind: 'infrastructure', implementation: 'Repository', source: 'src/modules/catalog/infrastructure/repository.ts', export: 'Repository', lifetime: 'process', runtime: 'nodejs', visibility: 'private', dependencies: [] },
    { id: 'catalog.query', kind: 'application', implementation: 'Query', source: 'src/modules/catalog/application/query.ts', export: 'Query', lifetime: 'process', runtime: 'nodejs', visibility: 'public', dependencies: ['catalog.repository'] },
  ],
});
`);
  return root;
}

describe('Forge service composition platform', () => {
  it('deterministic inventoryt és dependency utat épít', async () => {
    const root = await fixture();
    const first = await buildCompositionInventory(root);
    const second = await buildCompositionInventory(root);
    expect(first.issues.filter(({ severity }) => severity === 'error')).toEqual([]);
    expect(first.fingerprint).toBe(second.fingerprint);
    expect(compositionWhy(first, 'catalog.repository')).toEqual([
      'catalog.root',
      'catalog.query',
      'catalog.repository',
    ]);
  });

  it('async function composition exportot is felismer', async () => {
    const root = await fixture();
    await file(root, 'src/composition/app.server.ts', "import 'server-only'; export async function application() {}\n");
    expect((await buildCompositionInventory(root)).issues).not.toContainEqual(expect.objectContaining({
      code: 'COMPOSITION_ROOT_EXPORT_MISSING',
    }));
  });

  it('hiányzó bindingot, ciklust és lifetime mismatch-et jelez', async () => {
    const root = await fixture();
    await file(root, 'src/composition/catalog.composition.definition.ts', `
export const catalog = defineComposition({
  schemaVersion: 1,
  id: 'catalog',
  capability: 'service-composition',
  roots: [{ id: 'catalog.root', source: 'src/composition/app.server.ts', export: 'application', runtime: 'nodejs', services: ['catalog.query'] }],
  services: [
    { id: 'catalog.query', kind: 'application', implementation: 'Query', source: 'src/modules/catalog/application/query.ts', export: 'Query', lifetime: 'process', runtime: 'nodejs', visibility: 'public', dependencies: ['catalog.request', 'catalog.missing'] },
    { id: 'catalog.request', kind: 'provider', implementation: 'RequestProvider', source: 'src/modules/catalog/application/query.ts', export: 'Query', lifetime: 'request', runtime: 'nodejs', visibility: 'private', dependencies: ['catalog.query'] },
  ],
});
`);
    const codes = (await buildCompositionInventory(root)).issues.map(({ code }) => code);
    expect(codes).toEqual(expect.arrayContaining([
      'COMPOSITION_BINDING_MISSING',
      'COMPOSITION_CYCLE',
      'COMPOSITION_LIFETIME_MISMATCH',
    ]));
  });

  it('generated artifactot és dokumentációt drift-checkel', async () => {
    const root = await fixture();
    await generateComposition(root);
    await generateCompositionDocumentation(root);
    expect(await checkCompositionGeneration(root)).toHaveLength(0);
    expect(await checkCompositionDocumentation(root)).toHaveLength(0);
    const graph = path.join(root, 'src/generated/composition/graph-manifest.json');
    await writeFile(graph, `${await readFile(graph, 'utf8')}drift\n`, 'utf8');
    expect(await checkCompositionGeneration(root)).toContainEqual(expect.objectContaining({
      code: 'COMPOSITION_GENERATED_DRIFT',
    }));
  });
});
