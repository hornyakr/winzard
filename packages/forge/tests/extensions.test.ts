import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildCapabilityGraph } from '../src/extensions/capabilities';
import { EXTENSION_COMMANDS } from '../src/extensions/cli';
import { inspectPackage } from '../src/extensions/packages';
import { applyRecipe, planRecipe, planRemoval } from '../src/extensions/recipe';
import { loadExtensionManifest } from '../src/extensions/schema';
import { loadExtensionState } from '../src/extensions/state';

async function file(root: string, target: string, content: string): Promise<void> {
  const absolute = path.join(root, target);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, content, 'utf8');
}

async function projectFixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'winzard-extension-project-'));
  await file(root, 'package.json', `${JSON.stringify({
    name: 'extension-consumer',
    version: '0.1.0',
    private: true,
    type: 'module',
    winzard: { schemaVersion: 1, profile: 'test', capabilities: ['next-app', 'forge'] },
    dependencies: {},
    devDependencies: {},
  }, null, 2)}\n`);
  return root;
}

async function extensionFixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'winzard-extension-source-'));
  await file(root, 'extension.json', `${JSON.stringify({
    schemaVersion: 1,
    name: 'acme-demo',
    displayName: 'Acme Demo',
    version: '1.0.0',
    stability: 'experimental',
    provides: ['acme-demo'],
    requires: ['next-app', 'forge'],
    conflicts: [],
    packages: {
      runtime: [{ name: '@acme/demo-core', version: '^1.0.0' }],
      development: [{ name: '@acme/demo-testing', version: '^1.0.0' }],
      peer: [],
    },
    providers: [],
    recipe: { name: 'acme-demo', version: '1.0.0', path: 'recipes/acme-demo' },
    documentation: { entry: 'docs/index.md', consumerPack: 'docs/consumer' },
  }, null, 2)}\n`);
  await file(root, 'recipes/acme-demo/recipe.json', `${JSON.stringify({
    schemaVersion: 1,
    name: 'acme-demo',
    version: '1.0.0',
    provides: ['acme-demo'],
    requires: ['next-app', 'forge'],
    conflicts: [],
    dependencies: { runtime: [], development: [] },
    environment: [],
    configuration: [],
    files: [{ path: 'src/composition/acme-demo.server.ts', ownership: 'generated-read-only' }],
    generated: [],
    migrations: [],
  }, null, 2)}\n`);
  await file(root, 'recipes/acme-demo/files/src/composition/acme-demo.server.ts', "import 'server-only';\nexport const acmeDemo = Object.freeze({ enabled: true });\n");
  return root;
}

describe('Forge extension and recipe platform', () => {
  it('publishes the documented command surface', () => {
    expect(EXTENSION_COMMANDS).toEqual(expect.arrayContaining([
      'extension:add',
      'extension:update',
      'extension:remove',
      'recipe:plan',
      'recipe:apply',
      'recipe:check',
      'capability:graph',
      'package:check',
      'package:pack-smoke',
    ]));
  });

  it('plans, applies and re-applies a recipe idempotently', async () => {
    const project = await projectFixture();
    const source = await extensionFixture();
    const loaded = await loadExtensionManifest(source);
    expect(loaded.issues).toEqual([]);
    const recipeRoot = path.join(source, 'recipes/acme-demo');
    const first = await planRecipe(project, recipeRoot, loaded.manifest);
    expect(first.issues).toEqual([]);
    expect(first.operations).toContainEqual(expect.objectContaining({ kind: 'create-file', path: 'src/composition/acme-demo.server.ts' }));
    expect(first.operations).toContainEqual(expect.objectContaining({ kind: 'add-capability', capability: 'acme-demo' }));
    await applyRecipe(first);
    const second = await planRecipe(project, recipeRoot, loaded.manifest);
    expect(second.issues).toEqual([]);
    expect(second.operations).toEqual([]);
    expect((await loadExtensionState(project)).extensions[0]?.name).toBe('acme-demo');
  });

  it('fails closed on drift and preserves the modified file during removal planning', async () => {
    const project = await projectFixture();
    const source = await extensionFixture();
    const loaded = await loadExtensionManifest(source);
    const recipeRoot = path.join(source, 'recipes/acme-demo');
    await applyRecipe(await planRecipe(project, recipeRoot, loaded.manifest));
    const target = path.join(project, 'src/composition/acme-demo.server.ts');
    await writeFile(target, `${await readFile(target, 'utf8')}\n// consumer drift\n`, 'utf8');
    const plan = await planRecipe(project, recipeRoot, loaded.manifest);
    expect(plan.issues).toContainEqual(expect.objectContaining({ code: 'EXTENSION_RECIPE_DRIFT' }));
    const removal = await planRemoval(project, 'acme-demo');
    expect(removal.issues).toContainEqual(expect.objectContaining({ code: 'EXTENSION_RECIPE_DRIFT' }));
    expect(removal.operations).not.toContainEqual(expect.objectContaining({ kind: 'delete-file', path: 'src/composition/acme-demo.server.ts' }));
  });

  it('rejects recipe path traversal', async () => {
    const project = await projectFixture();
    const source = await extensionFixture();
    const recipeFile = path.join(source, 'recipes/acme-demo/recipe.json');
    const recipe = JSON.parse(await readFile(recipeFile, 'utf8')) as Record<string, unknown>;
    recipe.files = [{ path: '../escape.ts', source: '../escape.ts', ownership: 'generated-read-only' }];
    await writeFile(recipeFile, `${JSON.stringify(recipe, null, 2)}\n`, 'utf8');
    const plan = await planRecipe(project, path.dirname(recipeFile));
    expect(plan.issues).toContainEqual(expect.objectContaining({ code: 'EXTENSION_PATH_ESCAPE' }));
  });

  it('detects capability conflicts before apply', async () => {
    const project = await projectFixture();
    const source = await extensionFixture();
    const loaded = await loadExtensionManifest(source);
    expect(loaded.manifest).not.toBeNull();
    const conflicting = { ...loaded.manifest!, conflicts: ['next-app'] };
    const graph = await buildCapabilityGraph(project, [conflicting]);
    expect(graph.issues).toContainEqual(expect.objectContaining({ code: 'EXTENSION_CAPABILITY_CONFLICT' }));
  });

  it('checks package exports and tarball allowlist contracts', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'winzard-extension-package-'));
    await file(root, 'package.json', `${JSON.stringify({
      name: '@acme/demo-core',
      version: '1.0.0',
      type: 'module',
      exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' } },
      files: ['dist', 'README.md', 'LICENSE'],
      sideEffects: false,
    }, null, 2)}\n`);
    await file(root, 'dist/index.js', 'export const demo = true;\n');
    await file(root, 'dist/index.d.ts', 'export declare const demo: true;\n');
    expect((await inspectPackage(root)).issues).toEqual([]);
  });
});
