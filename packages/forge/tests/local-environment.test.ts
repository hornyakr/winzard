import { Buffer } from 'node:buffer';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from 'dotenv';
import { describe, expect, it } from 'vitest';

import { setupLocalEnvironment } from '../../../tools/setup-local-environment';

const projectRoots = Object.freeze([
  'apps/reference',
  'templates/minimal',
  'templates/webapp',
] as const);

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
const nodeRequire = createRequire(import.meta.url);

async function fixture(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'winzard-local-environment-'));
}

async function writeExample(root: string, projectRoot: string, value: string): Promise<void> {
  const directory = path.join(root, projectRoot);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, '.env.example'), `APP_NAME=${value}\n`, 'utf8');
}

function expectCanonicalServerActionKey(key: string): void {
  const decoded = Buffer.from(key, 'base64');
  expect(key).toMatch(/^[A-Za-z0-9+/]{43}=$/u);
  expect(decoded.byteLength).toBe(32);
  expect(decoded.toString('base64')).toBe(key);
}

describe('local environment bootstrap', () => {
  it('friss checkoutnál létrehozza a hiányzó, ignored lokális env fájlokat', async () => {
    const root = await fixture();
    for (const projectRoot of projectRoots) {
      await writeExample(root, projectRoot, projectRoot);
    }

    await expect(setupLocalEnvironment({
      repositoryRoot: root,
      environment: {},
    })).resolves.toEqual(projectRoots.map((projectRoot) => path.join(projectRoot, '.env.local')));

    for (const projectRoot of projectRoots) {
      await expect(readFile(path.join(root, projectRoot, '.env.local'), 'utf8'))
        .resolves.toBe(`APP_NAME=${projectRoot}\n`);
    }
  });

  it('kanonikus, 32 bájtos lokális Server Action kulcsot generál', async () => {
    const root = await fixture();
    const projectRoot = 'apps/reference';
    const directory = path.join(root, projectRoot);
    await mkdir(directory, { recursive: true });
    await writeFile(
      path.join(directory, '.env.example'),
      'APP_NAME=Example\nNEXT_SERVER_ACTIONS_ENCRYPTION_KEY=\n',
      'utf8',
    );

    await setupLocalEnvironment({
      repositoryRoot: root,
      environment: {},
      projectRoots: [projectRoot],
    });
    const environment = parse(await readFile(path.join(directory, '.env.local'), 'utf8'));

    expectCanonicalServerActionKey(environment.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY ?? '');
  });

  it('a korábbi ismert placeholdert javítja, más lokális értéket megőriz', async () => {
    const root = await fixture();
    const projectRoot = 'apps/reference';
    const directory = path.join(root, projectRoot);
    await writeExample(root, projectRoot, 'Example');
    await writeFile(
      path.join(directory, '.env.local'),
      [
        'APP_NAME=Custom',
        'NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=<generate-32-byte-base64-server-action-key>',
        '',
      ].join('\n'),
      'utf8',
    );

    await expect(setupLocalEnvironment({
      repositoryRoot: root,
      environment: {},
      projectRoots: [projectRoot],
    })).resolves.toEqual([path.join(projectRoot, '.env.local')]);
    const environment = parse(await readFile(path.join(directory, '.env.local'), 'utf8'));

    expect(environment.APP_NAME).toBe('Custom');
    expectCanonicalServerActionKey(environment.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY ?? '');
  });

  it('nem írja felül a fejlesztő meglévő lokális konfigurációját', async () => {
    const root = await fixture();
    const projectRoot = 'apps/reference';
    await writeExample(root, projectRoot, 'Example');
    await writeFile(path.join(root, projectRoot, '.env.local'), 'APP_NAME=Custom\n', 'utf8');

    await expect(setupLocalEnvironment({
      repositoryRoot: root,
      environment: {},
      projectRoots: [projectRoot],
    })).resolves.toEqual([]);
    await expect(readFile(path.join(root, projectRoot, '.env.local'), 'utf8'))
      .resolves.toBe('APP_NAME=Custom\n');
  });

  it('CI-, release- és teljes külső konfiguráció mellett nem hoz létre lokális fájlt', async () => {
    const environments = [
      { CI: 'true' },
      { APP_STAGE: 'staging' },
      {
        APP_URL: 'http://localhost:3000',
        APP_NAME: 'External',
        APP_STAGE: 'local',
        LOG_LEVEL: 'info',
        NEXT_PUBLIC_APP_NAME: 'External',
      },
    ] as const;

    for (const environment of environments) {
      const root = await fixture();
      const projectRoot = 'apps/reference';
      await writeExample(root, projectRoot, 'Example');
      await expect(setupLocalEnvironment({
        repositoryRoot: root,
        environment,
        projectRoots: [projectRoot],
      })).resolves.toEqual([]);
      await expect(readFile(path.join(root, projectRoot, '.env.local'), 'utf8'))
        .rejects.toMatchObject({ code: 'ENOENT' });
    }
  });

  it('a verziózott lokális példák érvényes Next.js kernelkonfigurációt adnak', async () => {
    for (const projectRoot of projectRoots) {
      const applicationRoot = path.join(repositoryRoot, projectRoot);
      const environment = {
        ...parse(await readFile(path.join(applicationRoot, '.env.example'), 'utf8')),
        NODE_ENV: 'development',
      };
      const { createKernelNextConfig } = nodeRequire(
        path.join(applicationRoot, 'src/platform/kernel-config/next-config.cjs'),
      ) as Readonly<{
        createKernelNextConfig(input: Readonly<{
          applicationRoot: string;
          environment: Readonly<Record<string, string | undefined>>;
        }>): Readonly<Record<string, unknown>>;
      }>;

      expect(environment.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY).toBe('');
      expect(() => createKernelNextConfig({ applicationRoot, environment })).not.toThrow();
    }
  });
});
