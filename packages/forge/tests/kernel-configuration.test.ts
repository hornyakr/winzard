import { mkdir, mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  checkKernelConfigurationDocumentation,
  generateKernelConfigurationDocumentation,
} from '../src/kernel-configuration/docs';
import {
  buildKernelConfigurationInventory,
  diffKernelConfiguration,
} from '../src/kernel-configuration/inventory';
import {
  compareArtifactManifests,
  createArtifactManifest,
} from '../src/kernel-configuration/reproducibility';

async function file(root: string, target: string, content: string): Promise<void> {
  const absolute = path.join(root, target);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, content, 'utf8');
}

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'winzard-kernel-config-'));
  await file(root, 'package.json', JSON.stringify({
    name: 'fixture-app',
    private: true,
    type: 'module',
    winzard: {
      schemaVersion: 1,
      profile: 'minimal',
      capabilities: ['next-app', 'forge', 'kernel-configuration'],
    },
  }, null, 2));
  await file(root, 'src/app/page.tsx', 'export default function Page() { return null; }\n');
  await file(root, 'src/platform/kernel-config/proxy-trust.ts', 'export const proxyTrust = true;\n');
  await file(root, 'next.config.ts', 'export default {};\n');
  await file(root, 'tsconfig.json', '{}\n');
  return root;
}

const validEnvironment = {
  NODE_ENV: 'production',
  APP_URL: 'https://app.example.test',
  APP_NAME: 'Fixture',
  APP_ID: 'fixture-app',
  APP_STAGE: 'staging',
  LOG_LEVEL: 'info',
  GIT_COMMIT: '0123456789abcdef',
  BUILD_ID: 'build-1',
  DEPLOYMENT_ID: 'deploy-1',
  SOURCE_DATE_EPOCH: '1',
  DEFAULT_LOCALE: 'hu',
  ENABLED_LOCALES: 'hu,en',
  TRUSTED_HOSTS: 'app.example.test',
  SERVER_ACTION_ALLOWED_ORIGINS: 'app.example.test',
  NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: Buffer.from('0123456789abcdef0123456789abcdef').toString('base64'),
  TRUSTED_PROXY_MODE: 'none',
  NEXT_DIST_DIR: '.next',
  CACHE_SCHEMA_VERSION: '1',
  COMPOSITION_HASH: 'auto',
  RUNTIME_WRITABLE_ROOT: '/tmp/winzard-fixture',
} as const;

describe('Forge kernel configuration platform', () => {
  it('deterministic, relative-path-only and secret-free inventoryt ad', async () => {
    const root = await fixture();
    const inventory = await buildKernelConfigurationInventory(root, {
      nodeEnv: 'production',
      processEnvironment: validEnvironment,
      runtimeMode: 'web',
    });
    expect(inventory.issues).toHaveLength(0);
    expect(inventory.projectRoot).toBe('.');
    expect(inventory.repositoryRelativeRoot).toBe('.');
    expect(inventory.records.find(({ id }) => id === 'runtime-mode')?.value).toBe('web');
    expect(inventory.fingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(inventory)).not.toContain(root);
  });

  it('stage-, locale-, path- és proxyhibákat stabil kóddal jelez', async () => {
    const root = await fixture();
    const inventory = await buildKernelConfigurationInventory(root, {
      nodeEnv: 'development',
      processEnvironment: {
        ...validEnvironment,
        NODE_ENV: 'development',
        APP_STAGE: 'production',
        ENABLED_LOCALES: 'hu,de',
        DEFAULT_LOCALE: 'en',
        TRUSTED_PROXY_MODE: 'cidr',
        TRUSTED_PROXY_CIDRS: '0.0.0.0/0',
        NEXT_DIST_DIR: '../../outside',
      },
    });
    expect(inventory.issues.map(({ code }) => code)).toEqual(expect.arrayContaining([
      'KERNEL_ENVIRONMENT_STAGE_CONFLICT',
      'KERNEL_LOCALE_UNSUPPORTED',
      'KERNEL_LOCALE_DEFAULT_NOT_ENABLED',
      'KERNEL_TRUSTED_PROXY_TOO_BROAD',
      'KERNEL_BUILD_DIR_OUTSIDE_PROJECT',
    ]));
  });

  it('debug-, Server Action-, worker- és CIDR-policyt is fail-closed ellenőriz', async () => {
    const root = await fixture();
    const inventory = await buildKernelConfigurationInventory(root, {
      nodeEnv: 'production',
      processEnvironment: {
        ...validEnvironment,
        APP_STAGE: 'production',
        PRODUCTION_BROWSER_SOURCE_MAPS: 'true',
        PRODUCTION_BROWSER_SOURCE_MAPS_WAIVER: '',
        SERVER_ACTION_ALLOWED_ORIGINS: '*',
        SERVER_ACTION_BODY_SIZE_LIMIT: 'unbounded',
        TRUSTED_PROXY_MODE: 'cidr',
        TRUSTED_PROXY_CIDRS: '10.0.0.0/99',
        WORKER_CONCURRENCY: '0',
      },
      runtimeMode: 'worker',
    });
    expect(inventory.issues.map(({ code }) => code)).toEqual(expect.arrayContaining([
      'KERNEL_DEBUG_EXPOSES_INTERNALS',
      'KERNEL_HOST_HEADER_INJECTION',
      'KERNEL_TRUSTED_HEADER_UNSAFE',
      'KERNEL_RUNTIME_MODE_AMBIGUOUS',
    ]));
  });

  it('redaktált stage diffet ad és nem enged repositoryn kívüli snapshotot', async () => {
    const root = await fixture();
    const env = Object.entries(validEnvironment).map(([key, value]) => `${key}=${value}`).join('\n');
    await file(root, '.env.staging', `${env}\n`);
    await file(root, '.env.production', `${env.replace('APP_STAGE=staging', 'APP_STAGE=production').replace('DEPLOYMENT_ID=deploy-1', 'DEPLOYMENT_ID=deploy-2')}\n`);
    const diff = await diffKernelConfiguration(root, 'staging', 'production');
    expect(diff.records.find(({ id }) => id === 'deployment-id')?.changed).toBe(true);
    expect(JSON.stringify(diff)).not.toContain('/tmp/winzard-kernel-config-');
    const outside = await diffKernelConfiguration(root, '../outside', 'production');
    expect(outside.issues).toContainEqual(expect.objectContaining({
      code: 'CONFIG_SOURCE_FILE_OUTSIDE_PROJECT',
    }));
  });

  it('determinista generált evidence-et készít és driftet észlel', async () => {
    const root = await fixture();
    await file(root, '.env', Object.entries({
      ...validEnvironment,
      NODE_ENV: 'test',
      APP_STAGE: 'local',
      APP_URL: 'http://localhost:3000',
      TRUSTED_HOSTS: 'localhost:3000',
      SERVER_ACTION_ALLOWED_ORIGINS: 'localhost:3000',
    }).map(([key, value]) => `${key}=${value}`).join('\n') + '\n');
    expect(await checkKernelConfigurationDocumentation(root)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'KERNEL_CONFIGURATION_DOCUMENTATION_DRIFT' }),
    ]));
    await generateKernelConfigurationDocumentation(root);
    expect(await checkKernelConfigurationDocumentation(root)).toHaveLength(0);
    const generated = await readFile(
      path.join(root, 'docs/90-generated/kernel-configuration/kernel-configuration.md'),
      'utf8',
    );
    expect(generated).toContain('Kernel configuration inventory');
    expect(generated).not.toContain(root);
  });

  it('canonical artifact manifestet és reprodukálhatósági diffet ad', async () => {
    const root = await fixture();
    await file(root, 'artifact-a/server/app.js', 'same\n');
    await file(root, 'artifact-a/cache/ignored.bin', 'one\n');
    await file(root, 'artifact-a/trace', 'volatile timing a\n');
    await file(root, 'artifact-a/prerender-manifest.json', JSON.stringify({
      version: 4,
      preview: {
        previewModeId: 'random-a',
        previewModeSigningKey: 'signing-a',
        previewModeEncryptionKey: 'encryption-a',
      },
      routes: { '/': { initialRevalidateSeconds: false } },
    }));
    await file(root, 'artifact-b/server/app.js', 'same\n');
    await file(root, 'artifact-b/cache/ignored.bin', 'two\n');
    await file(root, 'artifact-b/trace', 'volatile timing b\n');
    await file(root, 'artifact-b/prerender-manifest.json', JSON.stringify({
      routes: { '/': { initialRevalidateSeconds: false } },
      preview: {
        previewModeEncryptionKey: 'encryption-b',
        previewModeSigningKey: 'signing-b',
        previewModeId: 'random-b',
      },
      version: 4,
    }));
    const left = await createArtifactManifest(root, 'artifact-a');
    const right = await createArtifactManifest(root, 'artifact-b');
    expect(compareArtifactManifests(left, right).equal).toBe(true);
    expect(left.files.map(({ path: filePath }) => filePath)).not.toContain('trace');
    await file(root, 'artifact-b/server/app.js', 'changed\n');
    const changed = await createArtifactManifest(root, 'artifact-b');
    expect(compareArtifactManifests(left, changed)).toMatchObject({
      equal: false,
      changed: ['server/app.js'],
    });
    expect(JSON.stringify(left)).not.toContain(root);
  });

  it('a reference, template és recipe runtime snapshotok driftmentesek', async () => {
    const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
    const sourceRoot = path.join(
      repositoryRoot,
      'apps/reference/src/platform/kernel-config',
    );
    const targets = [
      'templates/minimal/src/platform/kernel-config',
      'templates/webapp/src/platform/kernel-config',
      'recipes/kernel-configuration/files/src/platform/kernel-config',
    ] as const;
    const recipe = JSON.parse(await readFile(
      path.join(repositoryRoot, 'recipes/kernel-configuration/recipe.json'),
      'utf8',
    )) as Readonly<{ files: readonly string[] }>;
    for (const recipePath of recipe.files) {
      await expect(stat(path.join(
        repositoryRoot,
        'recipes/kernel-configuration/files',
        recipePath,
      ))).resolves.toBeDefined();
    }

    for (const fileName of (await readdir(sourceRoot)).sort()) {
      const expected = await readFile(path.join(sourceRoot, fileName), 'utf8');
      for (const target of targets) {
        await expect(readFile(
          path.join(repositoryRoot, target, fileName),
          'utf8',
        )).resolves.toBe(expected);
      }
    }

    for (const relative of [
      'src/proxy.ts',
      'tests/unit/platform/http/proxy.test.ts',
      'tests/unit/platform/kernel-config/kernel-configuration.test.ts',
    ] as const) {
      const expected = await readFile(
        path.join(repositoryRoot, 'apps/reference', relative),
        'utf8',
      );
      for (const target of [
        'templates/minimal',
        'templates/webapp',
        'recipes/kernel-configuration/files',
      ] as const) {
        await expect(readFile(
          path.join(repositoryRoot, target, relative),
          'utf8',
        )).resolves.toBe(expected);
      }
    }
  });

});
