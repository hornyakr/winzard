import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { diffConfiguration } from '../src/configuration/diff';
import { checkConfigurationDrift, findUnusedConfiguration } from '../src/configuration/drift';
import { loadEnvironmentSnapshot } from '../src/configuration/environment';
import { buildConfigurationInventory, redactConfigurationRecord } from '../src/configuration/inventory';
import {
  CONFIGURATION_REFERENCE_PATH,
  checkConfigurationReference,
  generateConfigurationReference,
} from '../src/configuration/reference';
import { scanRepositorySecrets } from '../src/configuration/secrets';
import { loadProjectManifest, type WinzardManifest } from '../src/manifest';
import { authEnvironmentSchema } from '../../../recipes/authentication/files/src/platform/auth/auth-env.server';
import { databaseEnvironmentSchema } from '../../../templates/webapp/src/platform/database/database-env.server';

const execFileAsync = promisify(execFile);

async function fixture(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'winzard-config-'));
}

async function file(root: string, target: string, content: string): Promise<void> {
  const absolute = path.join(root, target);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, content, 'utf8');
}

const minimalManifest: WinzardManifest = {
  schemaVersion: 1,
  profile: 'minimal',
  capabilities: ['next-app', 'forge'],
  documentation: null,
};

const minimalExample = [
  'APP_URL=http://localhost:3000',
  'APP_NAME=Atlas',
  'APP_STAGE=local',
  'LOG_LEVEL=info',
  'NEXT_PUBLIC_APP_NAME=Atlas',
  '',
].join('\n');

describe('Next-compatible environment loading', () => {
  it('a process.env és a Next.js fájlprecedencia szerint old fel', async () => {
    const root = await fixture();
    await file(root, '.env', 'APP_NAME=base\nBASE=base\nURL=https://example.com/$BASE\n');
    await file(root, '.env.development', 'APP_NAME=development\n');
    await file(root, '.env.local', 'APP_NAME=local\n');
    await file(root, '.env.development.local', 'APP_NAME=development-local\n');

    const snapshot = await loadEnvironmentSnapshot(root, {
      nodeEnv: 'development',
      processEnvironment: { APP_NAME: 'process' },
    });

    expect(snapshot.values.APP_NAME).toBe('process');
    expect(snapshot.values.URL).toBe('https://example.com/base');
    expect(snapshot.sources.get('APP_NAME')?.label).toBe('process.env');
    expect(snapshot.loadedFiles).toEqual([
      '.env.development.local',
      '.env.local',
      '.env.development',
      '.env',
    ]);
  });

  it('test környezetben szándékosan kihagyja a .env.local fájlt', async () => {
    const root = await fixture();
    await file(root, '.env.local', 'APP_NAME=local\n');
    await file(root, '.env.test', 'APP_NAME=test\n');
    const snapshot = await loadEnvironmentSnapshot(root, {
      nodeEnv: 'test',
      processEnvironment: {},
    });
    expect(snapshot.values.APP_NAME).toBe('test');
    expect(snapshot.loadedFiles).toEqual(['.env.test']);
  });

  it('jelzi az expanziós ciklust és a nem standard NODE_ENV értéket', async () => {
    const root = await fixture();
    await file(root, '.env.staging', 'A=$B\nB=$A\n');
    const snapshot = await loadEnvironmentSnapshot(root, {
      nodeEnv: 'staging',
      processEnvironment: {},
    });
    expect(snapshot.issues.map(({ code }) => code)).toEqual(expect.arrayContaining([
      'CONFIG_NODE_ENV_INVALID',
      'CONFIG_ENV_EXPANSION_CYCLE',
    ]));
  });
});

describe('configuration inventory and drift', () => {
  it('capability-aware, redaktált inventoryt ad', async () => {
    const root = await fixture();
    await file(root, 'src/platform/config/app-env.ts', 'const app = process.env.APP_NAME;\n');
    const inventory = await buildConfigurationInventory(root, minimalManifest, {
      processEnvironment: {
        APP_URL: 'http://localhost:3000',
        APP_NAME: 'Atlas',
        APP_STAGE: 'local',
        LOG_LEVEL: 'info',
        NEXT_PUBLIC_APP_NAME: 'Atlas',
      },
    });
    expect(inventory.issues).toHaveLength(0);
    const record = inventory.records.find(({ definition }) => definition.key === 'APP_NAME');
    expect(record?.status).toBe('valid');
    expect(record?.consumers).toContain('src/platform/config/app-env.ts');
    const redacted = redactConfigurationRecord(record!);
    expect(redacted).not.toHaveProperty('value');
    expect(redacted.fingerprint).toMatch(/^[a-f0-9]{12}$/u);
  });

  it('érvényesíti a tartományokat, a stage-et és a secret minimumot', async () => {
    const root = await fixture();
    const manifest: WinzardManifest = {
      ...minimalManifest,
      profile: 'webapp',
      capabilities: ['next-app', 'forge', 'prisma-postgresql', 'authentication'],
    };
    const inventory = await buildConfigurationInventory(root, manifest, {
      processEnvironment: {
        APP_URL: 'ftp://example.com/path',
        APP_NAME: '',
        APP_STAGE: 'qa',
        LOG_LEVEL: 'verbose',
        NEXT_PUBLIC_APP_NAME: 'Atlas',
        DATABASE_URL: 'mysql://localhost/app',
        DATABASE_POOL_MAX: '101',
        DATABASE_CONNECTION_TIMEOUT_MS: '10',
        AUTH_SECRET: 'a'.repeat(32),
      },
    });
    expect(inventory.issues.map(({ code }) => code)).toEqual(expect.arrayContaining([
      'CONFIG_URL_PROTOCOL_FORBIDDEN',
      'CONFIG_KEY_EMPTY',
      'CONFIG_KEY_INVALID',
      'CONFIG_NUMBER_OUT_OF_RANGE',
      'CONFIG_DEFAULT_UNSAFE',
    ]));
  });

  it('a whitespace-only értéket következetesen üresként jelöli', async () => {
    const root = await fixture();
    const inventory = await buildConfigurationInventory(root, minimalManifest, {
      processEnvironment: {
        APP_URL: 'http://localhost:3000',
        APP_NAME: '   ',
        APP_STAGE: 'local',
        LOG_LEVEL: 'info',
        NEXT_PUBLIC_APP_NAME: 'Atlas',
      },
    });
    const record = inventory.records.find(({ definition }) => definition.key === 'APP_NAME');
    expect(record).toMatchObject({ status: 'empty', present: true, empty: true, valid: false });
  });

  it('production stage-ben a Forge inventory is HTTPS APP_URL-t követel', async () => {
    const root = await fixture();
    const inventory = await buildConfigurationInventory(root, minimalManifest, {
      processEnvironment: {
        APP_URL: 'http://example.com',
        APP_NAME: 'Atlas',
        APP_STAGE: 'production',
        LOG_LEVEL: 'info',
        NEXT_PUBLIC_APP_NAME: 'Atlas',
      },
    });
    const appUrlIssues = inventory.issues.filter(({
      code,
      key,
    }) => code === 'CONFIG_URL_PROTOCOL_FORBIDDEN' && key === 'APP_URL');
    expect(appUrlIssues).toHaveLength(1);
    expect(inventory.records.find(({ definition }) => definition.key === 'APP_URL')?.status).toBe('invalid');
  });

  it('nem tekint tetszőleges input mezőt deklarálatlan env használatnak', async () => {
    const root = await fixture();
    await file(root, '.env.example', minimalExample);
    await file(root, 'src/app/page.tsx', [
      'export const orderId = input.ORDER_ID;',
      'export const appName = environment.APP_NAME;',
      'export const direct = process.env.UNOWNED_URL;',
      '',
    ].join('\n'));
    const issues = await checkConfigurationDrift(root, minimalManifest);
    expect(issues).toContainEqual(expect.objectContaining({ code: 'CONFIG_KEY_UNDECLARED', key: 'UNOWNED_URL' }));
    expect(issues).not.toContainEqual(expect.objectContaining({ code: 'CONFIG_KEY_UNDECLARED', key: 'ORDER_ID' }));
  });

  it('a kulcs deklarációját nem tekinti konfigurációfogyasztásnak', async () => {
    const root = await fixture();
    await file(root, '.env.example', minimalExample);
    await file(root, 'src/platform/config/schema.ts', [
      "export const schema = {",
      "  APP_URL: 'url',",
      "  APP_NAME: 'string',",
      "  APP_STAGE: 'stage',",
      "  LOG_LEVEL: 'level',",
      "  NEXT_PUBLIC_APP_NAME: 'public',",
      "};",
    ].join('\n'));

    const issues = await findUnusedConfiguration(root, minimalManifest);
    expect(issues).toContainEqual(expect.objectContaining({
      code: 'CONFIG_KEY_UNUSED',
      key: 'APP_URL',
    }));
  });

  it('driftet jelez az env example és az undeclared process.env használat között', async () => {
    const root = await fixture();
    await file(root, '.env.example', minimalExample.replace('LOG_LEVEL=info\n', ''));
    await file(root, 'src/app/page.tsx', 'export const value = process.env.UNOWNED_URL;\n');
    const issues = await checkConfigurationDrift(root, minimalManifest);
    expect(issues).toContainEqual(expect.objectContaining({ code: 'CONFIG_ENV_EXAMPLE_DRIFT', key: 'LOG_LEVEL' }));
    expect(issues).toContainEqual(expect.objectContaining({ code: 'CONFIG_KEY_UNDECLARED', key: 'UNOWNED_URL' }));
  });

  it('determinista reference-et generál és ellenőriz', async () => {
    const root = await fixture();
    await file(root, '.env.example', minimalExample);
    expect(await checkConfigurationReference(root, minimalManifest)).toContainEqual(
      expect.objectContaining({ code: 'CONFIG_REFERENCE_DRIFT' }),
    );
    await generateConfigurationReference(root, minimalManifest);
    expect(await checkConfigurationReference(root, minimalManifest)).toHaveLength(0);
    const reference = await readFile(path.join(root, CONFIGURATION_REFERENCE_PATH), 'utf8');
    expect(reference).toContain('NEXT_PUBLIC_APP_NAME');
    expect(reference).toContain('Type / validation');
    expect(reference).toContain('Introduced | Deprecated | Removed');
    expect(reference).toContain('enum(local\\|preview\\|staging\\|production)');
  });

  it('redaktált stage diffet ad értékek kiírása nélkül', async () => {
    const root = await fixture();
    await file(root, '.env.staging', minimalExample.replace('APP_STAGE=local', 'APP_STAGE=staging'));
    await file(root, '.env.production', minimalExample.replace('APP_STAGE=local', 'APP_STAGE=production'));
    const result = await diffConfiguration(root, minimalManifest, 'staging', 'production');
    const stage = result.records.find(({ key }) => key === 'APP_STAGE');
    expect(stage?.changed).toBe(true);
    expect(JSON.stringify(result)).not.toContain('APP_STAGE=production');
  });
});


describe('runtime configuration schemas', () => {
  it('a database schema ugyanazokat a DSN- és integerhatárokat kényszeríti ki', () => {
    expect(() => databaseEnvironmentSchema.parse({
      DATABASE_URL: 'postgresql://localhost',
      DATABASE_POOL_MAX: '1e2',
      DATABASE_CONNECTION_TIMEOUT_MS: '1000',
    })).toThrow();
    expect(databaseEnvironmentSchema.parse({
      DATABASE_URL: 'postgresql://user:password@localhost:5432/atlas',
      DATABASE_POOL_MAX: '10',
      DATABASE_CONNECTION_TIMEOUT_MS: '5000',
    })).toMatchObject({
      DATABASE_POOL_MAX: 10,
      DATABASE_CONNECTION_TIMEOUT_MS: 5000,
    });
  });

  it('az authentication schema elutasítja az alacsony változatosságú és placeholder secreteket', () => {
    expect(() => authEnvironmentSchema.parse({ AUTH_SECRET: 'a'.repeat(32) })).toThrow();
    expect(() => authEnvironmentSchema.parse({ AUTH_SECRET: '<generate-at-least-32-random-characters>' })).toThrow();
    const generatedSecret = ['xT9!qL2#', 'vN7@pR4$', 'kM8&zC5*', 'wS1-yH6_'].join('');
    expect(() => authEnvironmentSchema.parse({ AUTH_SECRET: generatedSecret })).not.toThrow();
  });
});

describe('secret and manifest safety', () => {
  it('felismeri a public secretet, raw env logot és privát kulcsot', async () => {
    const root = await fixture();
    await file(
      root,
      'src/client.tsx',
      [`'use client'; console.log(process.`, 'env); const key = process.env.NEXT_PUBLIC_AU', 'TH_SECRET;\n'].join(''),
    );
    await file(root, 'leaked.pem', ['-----BEGIN PRIVATE ', 'KEY-----\nnot-a-real-key\n'].join(''));
    const issues = await scanRepositorySecrets(root);
    expect(issues.map(({ code }) => code)).toEqual(expect.arrayContaining([
      'CONFIG_PUBLIC_SECRET',
      'CONFIG_RAW_ENV_LOG',
      'CONFIG_SECRET_EXPOSED',
    ]));
  });

  it('Git repositoryban az ignored lokális envet kihagyja, a tracked runtime envet tiltja', async () => {
    const root = await fixture();
    await file(root, '.gitignore', '.env*\n');
    await file(root, '.env.local', 'AUTH_SECRET=local-only-secret-value\n');
    await execFileAsync('git', ['init'], { cwd: root });

    expect(await scanRepositorySecrets(root)).not.toContainEqual(expect.objectContaining({
      code: 'CONFIG_SECRET_FILE_COMMITTED',
      file: '.env.local',
    }));

    await execFileAsync('git', ['add', '-f', '.env.local'], { cwd: root });
    expect(await scanRepositorySecrets(root)).toContainEqual(expect.objectContaining({
      code: 'CONFIG_SECRET_FILE_COMMITTED',
      file: '.env.local',
    }));
  });

  it('a placeholder literal secret fallbacket is unsafe defaultként jelzi', async () => {
    const root = await fixture();
    await file(
      root,
      'src/platform/auth/auth-env.server.ts',
      [
        'export const secret = process.',
        "env.AUTH_SECRET ?? '<generate-a-secret>';\n",
      ].join(''),
    );

    expect(await scanRepositorySecrets(root)).toContainEqual(expect.objectContaining({
      code: 'CONFIG_DEFAULT_UNSAFE',
      key: 'AUTH_SECRET',
    }));

    await file(
      root,
      'src/platform/auth/bracket-env.server.ts',
      [
        'export const secret = process.',
        "env['AUTH_SECRET'] ?? `development-secret`;\n",
      ].join(''),
    );
    expect(await scanRepositorySecrets(root)).toContainEqual(expect.objectContaining({
      code: 'CONFIG_DEFAULT_UNSAFE',
      key: 'AUTH_SECRET',
      file: 'src/platform/auth/bracket-env.server.ts',
    }));
  });

  it('csak safe, lokális értéket enged a verziózott env fixture-ekben', async () => {
    const root = await fixture();
    await file(
      root,
      'nested/.env.example',
      'DATABASE_URL=postgresql://user:password@localhost:5432/example\n',
    );
    await file(
      root,
      'nested/.env.test',
      'AUTH_SECRET=actual-production-secret-value-1234567890\n',
    );
    await file(root, 'nested/.env.local', 'APP_NAME=not-committable\n');

    const issues = await scanRepositorySecrets(root);
    expect(issues).toContainEqual(expect.objectContaining({
      code: 'CONFIG_SECRET_EXPOSED',
      file: 'nested/.env.test',
      key: 'AUTH_SECRET',
    }));
    expect(issues).toContainEqual(expect.objectContaining({
      code: 'CONFIG_SECRET_FILE_COMMITTED',
      file: 'nested/.env.local',
    }));
    expect(issues).not.toContainEqual(expect.objectContaining({
      code: 'CONFIG_SECRET_EXPOSED',
      file: 'nested/.env.example',
    }));
  });

  it('megőrzi az aktív capabilityConfig blokkot és elutasítja az inaktív blokkot', async () => {
    const root = await fixture();
    await file(root, 'winzard.json', JSON.stringify({
      schemaVersion: 1,
      profile: 'minimal',
      capabilities: ['next-app'],
      capabilityConfig: {
        'next-app': { typedRoutes: true },
      },
    }));
    const valid = await loadProjectManifest(root);
    expect(valid.failures).toHaveLength(0);
    expect(valid.manifest?.capabilityConfig?.['next-app']).toEqual({ typedRoutes: true });
    expect(Object.isFrozen(valid.manifest?.capabilityConfig?.['next-app'])).toBe(true);

    await file(root, 'winzard.json', JSON.stringify({
      schemaVersion: 1,
      profile: 'minimal',
      capabilities: ['next-app'],
      capabilityConfig: {
        authentication: { mode: 'enabled' },
      },
    }));
    expect((await loadProjectManifest(root)).failures).toContainEqual(
      expect.objectContaining({ code: 'MANIFEST_CAPABILITY_CONFIG_INACTIVE' }),
    );
  });

  it('elutasítja a documentation blokkot dokumentációs capability nélkül', async () => {
    const root = await fixture();
    await file(root, 'winzard.json', JSON.stringify({
      schemaVersion: 1,
      profile: 'minimal',
      capabilities: ['next-app'],
      documentation: {
        contractVersion: 1,
        projectPrefix: 'ATLAS',
        consumerContractVersion: '0.1.0',
        contextBudgetBytes: 262144,
      },
    }));
    expect((await loadProjectManifest(root)).failures).toContainEqual(
      expect.objectContaining({ code: 'DOCUMENTATION_MANIFEST_ORPHAN' }),
    );
  });

  it('stabil hibakóddal jelzi a hibás manifest JSON-t', async () => {
    const root = await fixture();
    await file(root, 'winzard.json', '{ invalid json');
    expect((await loadProjectManifest(root)).failures).toContainEqual(
      expect.objectContaining({ code: 'MANIFEST_JSON_INVALID', file: 'winzard.json' }),
    );
  });

  it('elutasítja a két manifestforrást és az ismeretlen mezőt', async () => {
    const root = await fixture();
    await file(root, 'winzard.json', JSON.stringify({
      schemaVersion: 1,
      profile: 'minimal',
      capabilities: [],
      typo: true,
    }));
    await file(root, 'package.json', JSON.stringify({
      winzard: { schemaVersion: 1, profile: 'minimal', capabilities: [] },
    }));
    expect((await loadProjectManifest(root)).failures).toContainEqual(
      expect.objectContaining({ code: 'MANIFEST_AMBIGUOUS' }),
    );

    await writeFile(path.join(root, 'package.json'), '{}', 'utf8');
    expect((await loadProjectManifest(root)).failures).toContainEqual(
      expect.objectContaining({ code: 'MANIFEST_UNKNOWN_FIELD' }),
    );
  });
});
