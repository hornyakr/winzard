import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { applyRecipe, planRecipe, planRemoval } from '../src/extensions/recipe';
import { loadExtensionManifest } from '../src/extensions/schema';
import { loadExtensionState } from '../src/extensions/state';

async function file(root: string, target: string, content: string): Promise<void> {
  const absolute = path.join(root, target);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, content, 'utf8');
}

async function project(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'winzard-lifecycle-project-'));
  await file(root, 'package.json', `${JSON.stringify({
    name: 'lifecycle-consumer',
    version: '0.1.0',
    private: true,
    type: 'module',
    winzard: { schemaVersion: 1, profile: 'test', capabilities: ['next-app', 'forge'] },
    dependencies: {},
    devDependencies: {},
  }, null, 2)}\n`);
  return root;
}

async function extension(
  name: string,
  version: string,
  provides: readonly string[],
  requires: readonly string[],
): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), `winzard-${name}-`));
  await file(root, 'extension.json', `${JSON.stringify({
    schemaVersion: 1,
    name,
    displayName: name,
    version,
    stability: 'experimental',
    provides,
    requires,
    conflicts: [],
    packages: { runtime: [], development: [], peer: [] },
    providers: [],
    recipe: { name, version, path: `recipes/${name}` },
  }, null, 2)}\n`);
  await file(root, `recipes/${name}/recipe.json`, `${JSON.stringify({
    schemaVersion: 1,
    name,
    version,
    provides,
    requires,
    conflicts: [],
    dependencies: { runtime: [], development: [] },
    environment: [],
    configuration: [],
    files: [{ path: `src/composition/${name}.server.ts`, ownership: 'generated-read-only' }],
    generated: [],
    migrations: [],
  }, null, 2)}\n`);
  await file(root, `recipes/${name}/files/src/composition/${name}.server.ts`, `import 'server-only';\nexport const ${name.replace(/-/gu, '_')} = true;\n`);
  return root;
}

async function install(projectRoot: string, source: string): Promise<void> {
  const loaded = await loadExtensionManifest(source);
  expect(loaded.issues).toEqual([]);
  expect(loaded.manifest).not.toBeNull();
  const recipeRoot = path.join(source, loaded.manifest!.recipe!.path);
  const plan = await planRecipe(projectRoot, recipeRoot, loaded.manifest);
  expect(plan.issues).toEqual([]);
  await applyRecipe(plan);
}

describe('Forge extension update and removal lifecycle', () => {
  it('requires and applies an explicit update migration chain', async () => {
    const projectRoot = await project();
    const source = await extension('acme-demo', '1.0.0', ['acme-demo'], ['next-app', 'forge']);
    await install(projectRoot, source);

    const extensionFile = path.join(source, 'extension.json');
    const extensionManifest = JSON.parse(await readFile(extensionFile, 'utf8')) as Record<string, unknown>;
    extensionManifest.version = '2.0.0';
    extensionManifest.recipe = { name: 'acme-demo', version: '2.0.0', path: 'recipes/acme-demo' };
    await writeFile(extensionFile, `${JSON.stringify(extensionManifest, null, 2)}\n`, 'utf8');

    const recipeFile = path.join(source, 'recipes/acme-demo/recipe.json');
    const recipe = JSON.parse(await readFile(recipeFile, 'utf8')) as Record<string, unknown>;
    recipe.version = '2.0.0';
    recipe.migrations = [{ id: 'acme-demo-1-to-2', from: '1.0.0', to: '2.0.0', destructive: false, files: [] }];
    await writeFile(recipeFile, `${JSON.stringify(recipe, null, 2)}\n`, 'utf8');

    const loaded = await loadExtensionManifest(source);
    const plan = await planRecipe(projectRoot, path.dirname(recipeFile), loaded.manifest);
    expect(plan.issues).toEqual([]);
    expect(plan.migrations).toEqual(['acme-demo-1-to-2']);
    await applyRecipe(plan);
    const installed = (await loadExtensionState(projectRoot)).extensions[0];
    expect(installed?.version).toBe('2.0.0');
    expect(installed?.appliedMigrations).toContain('acme-demo-1-to-2');
  });

  it('blocks an update when the migration chain is missing or destructive', async () => {
    const projectRoot = await project();
    const source = await extension('acme-demo', '1.0.0', ['acme-demo'], ['next-app', 'forge']);
    await install(projectRoot, source);
    const extensionFile = path.join(source, 'extension.json');
    const manifest = JSON.parse(await readFile(extensionFile, 'utf8')) as Record<string, unknown>;
    manifest.version = '2.0.0';
    manifest.recipe = { name: 'acme-demo', version: '2.0.0', path: 'recipes/acme-demo' };
    await writeFile(extensionFile, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    const recipeFile = path.join(source, 'recipes/acme-demo/recipe.json');
    const recipe = JSON.parse(await readFile(recipeFile, 'utf8')) as Record<string, unknown>;
    recipe.version = '2.0.0';
    await writeFile(recipeFile, `${JSON.stringify(recipe, null, 2)}\n`, 'utf8');
    let loaded = await loadExtensionManifest(source);
    let plan = await planRecipe(projectRoot, path.dirname(recipeFile), loaded.manifest);
    expect(plan.issues).toContainEqual(expect.objectContaining({ code: 'EXTENSION_RECIPE_MIGRATION_MISSING' }));
    recipe.migrations = [{ id: 'destructive', from: '1.0.0', to: '2.0.0', destructive: true, files: [] }];
    await writeFile(recipeFile, `${JSON.stringify(recipe, null, 2)}\n`, 'utf8');
    loaded = await loadExtensionManifest(source);
    plan = await planRecipe(projectRoot, path.dirname(recipeFile), loaded.manifest);
    expect(plan.issues).toContainEqual(expect.objectContaining({ code: 'EXTENSION_MIGRATION_UNAPPROVED' }));
  });

  it('blocks removal while another installed extension depends on its capability', async () => {
    const projectRoot = await project();
    const provider = await extension('acme-provider', '1.0.0', ['acme-provider'], ['next-app', 'forge']);
    const consumer = await extension('acme-consumer', '1.0.0', ['acme-consumer'], ['next-app', 'forge', 'acme-provider']);
    await install(projectRoot, provider);
    await install(projectRoot, consumer);
    const removal = await planRemoval(projectRoot, 'acme-provider');
    expect(removal.issues).toContainEqual(expect.objectContaining({ code: 'EXTENSION_REMOVE_DEPENDENT_PRESENT' }));
  });
});
