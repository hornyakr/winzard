import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { COMPOSITION_COMMANDS } from '../src/composition/cli';
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
  await file(root, 'instrumentation.ts', "export async function register() { const composition = await import('./src/platform/composition/validate-composition.server'); await composition.validateComposition(); }\n");
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

  it('a globális Forge command-lista számára publikálja a composition parancsokat', () => {
    expect(COMPOSITION_COMMANDS).toEqual([
      'composition:list',
      'composition:inspect',
      'composition:graph',
      'composition:check',
      'composition:why',
      'composition:docs',
      'composition:generate',
      'service:aliases',
      'service:lifetimes',
    ]);
  });

  it('ismeretlen mezőt, hibás enumot és hiányzó startup validátort fail-closed jelez', async () => {
    const root = await fixture();
    await file(root, 'instrumentation.ts', 'export async function register() {}\n');
    await file(root, 'src/composition/catalog.composition.definition.ts', `
export const catalog = defineComposition({
  schemaVersion: 1,
  id: 'catalog',
  capability: 'service-composition',
  roots: [{ id: 'catalog.root', source: 'src/composition/app.server.ts', export: 'application', runtime: 'browser', services: ['catalog.query'], unexpected: true }],
  services: [
    { id: 'catalog.query', kind: 'application', implementation: 'Query', source: 'src/modules/catalog/application/query.ts', export: 'Query', lifetime: 'proces', runtime: 'nodejs', visibility: 'public', dependencies: [] },
  ],
});
`);
    const codes = (await buildCompositionInventory(root)).issues.map(({ code }) => code);
    expect(codes).toEqual(expect.arrayContaining([
      'COMPOSITION_UNKNOWN_FIELD',
      'COMPOSITION_ENUM_INVALID',
      'COMPOSITION_STARTUP_VALIDATOR_MISSING',
    ]));
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

  it('resolve-config módban ellenőrzi a config- és secret-tulajdonlást', async () => {
    const root = await fixture();
    await file(root, 'package.json', `${JSON.stringify({
      name: 'composition-fixture',
      private: true,
      winzard: {
        schemaVersion: 1,
        profile: 'minimal',
        capabilities: ['next-app', 'forge', 'kernel-configuration', 'service-composition'],
      },
    }, null, 2)}\n`);
    await file(root, 'src/composition/catalog.composition.definition.ts', `
export const catalog = defineComposition({
  schemaVersion: 1,
  id: 'catalog',
  capability: 'service-composition',
  roots: [{ id: 'catalog.root', source: 'src/composition/app.server.ts', export: 'application', runtime: 'nodejs', services: ['catalog.query'] }],
  services: [
    { id: 'catalog.query', kind: 'application', implementation: 'Query', source: 'src/modules/catalog/application/query.ts', export: 'Query', lifetime: 'process', runtime: 'nodejs', visibility: 'public', dependencies: [], configKeys: ['UNKNOWN_CONFIG', 'NEXT_SERVER_ACTIONS_ENCRYPTION_KEY'] },
  ],
});
`);
    const codes = (await buildCompositionInventory(root, { resolveConfig: true })).issues.map(({ code }) => code);
    expect(codes).toEqual(expect.arrayContaining([
      'COMPOSITION_CONFIG_MISSING',
      'COMPOSITION_SECRET_EXPOSED',
    ]));
  });

  it('a Node startup registry nem importál Edge-only composition rootot', async () => {
    const root = await fixture();
    await file(root, 'src/composition/edge.server.ts', "import 'server-only'; export const edgeApplication = Object.freeze({});\n");
    await file(root, 'src/modules/catalog/application/edge-query.ts', 'export class EdgeQuery {}\n');
    await file(root, 'src/composition/edge.composition.definition.ts', `
export const edge = defineComposition({
  schemaVersion: 1,
  id: 'edge',
  capability: 'service-composition',
  roots: [{ id: 'edge.root', source: 'src/composition/edge.server.ts', export: 'edgeApplication', runtime: 'edge', services: ['edge.query'] }],
  services: [
    { id: 'edge.query', kind: 'application', implementation: 'EdgeQuery', source: 'src/modules/catalog/application/edge-query.ts', export: 'EdgeQuery', lifetime: 'process', runtime: 'edge', visibility: 'public', dependencies: [] },
  ],
});
`);
    await generateComposition(root);
    const registry = await readFile(path.join(root, 'src/generated/composition/registry.ts'), 'utf8');
    expect(registry).toContain('"runtime": "edge"');
    expect(registry).not.toContain('edgeApplication as compositionRoot');
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
