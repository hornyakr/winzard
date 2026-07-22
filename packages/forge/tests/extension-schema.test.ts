import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { planRecipe } from '../src/extensions/recipe';
import { loadExtensionManifest } from '../src/extensions/schema';

async function file(root: string, target: string, content: string): Promise<void> {
  const absolute = path.join(root, target);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, content, 'utf8');
}

async function project(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'winzard-schema-project-'));
  await file(root, 'package.json', `${JSON.stringify({
    name: 'schema-consumer',
    version: '0.1.0',
    private: true,
    type: 'module',
    winzard: { schemaVersion: 1, profile: 'test', capabilities: ['next-app', 'forge'] },
    dependencies: {},
    devDependencies: {},
  }, null, 2)}\n`);
  return root;
}

describe('Forge extension schemas', () => {
  it('rejects unknown fields, escaping paths and ambiguous required providers', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'winzard-invalid-extension-'));
    await file(root, 'extension.json', `${JSON.stringify({
      schemaVersion: 1,
      name: 'acme-invalid',
      displayName: 'Acme Invalid',
      version: '1.0.0',
      stability: 'experimental',
      provides: ['acme-invalid'],
      requires: ['next-app'],
      conflicts: [],
      packages: { runtime: [], development: [], peer: [] },
      providers: [
        { id: '@acme/provider-a', contract: 'storage', package: '@acme/provider-a', required: true },
        { id: '@acme/provider-b', contract: 'storage', package: '@acme/provider-b', required: true },
      ],
      recipe: { name: 'acme-invalid', version: '1.0.0', path: '../outside' },
      unexpected: true,
    }, null, 2)}\n`);
    const result = await loadExtensionManifest(root);
    expect(result.manifest).toBeNull();
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'EXTENSION_MANIFEST_INVALID' }),
      expect.objectContaining({ code: 'EXTENSION_PROVIDER_AMBIGUOUS' }),
      expect.objectContaining({ code: 'EXTENSION_PATH_ESCAPE' }),
    ]));
  });

  it('resolves versionless legacy recipe dependencies from the nearest repository package', async () => {
    const projectRoot = await project();
    const source = await mkdtemp(path.join(os.tmpdir(), 'winzard-legacy-recipe-'));
    await file(source, 'package.json', `${JSON.stringify({
      name: 'legacy-recipe-source',
      version: '1.0.0',
      private: true,
      dependencies: { 'server-only': '0.0.1' },
    }, null, 2)}\n`);
    await file(source, 'recipes/legacy/recipe.json', `${JSON.stringify({
      schemaVersion: 1,
      name: 'legacy',
      provides: [],
      requires: ['next-app', 'forge'],
      dependencies: { runtime: ['server-only'], development: [] },
      environment: [],
      files: [],
    }, null, 2)}\n`);
    const plan = await planRecipe(projectRoot, path.join(source, 'recipes/legacy'));
    expect(plan.issues).toEqual([]);
    expect(plan.operations).toContainEqual(expect.objectContaining({
      kind: 'add-runtime-dependency',
      name: 'server-only',
      version: '0.0.1',
    }));
  });
});
