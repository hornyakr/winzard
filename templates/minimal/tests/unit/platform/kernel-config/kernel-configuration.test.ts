import { Buffer } from 'node:buffer';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { createBuildIdentity, parseSourceDateEpoch } from '@/platform/kernel-config/build-identity';
import {
  createCacheNamespace,
  createInMemorySharedCache,
  createInMemorySharedCacheStore,
} from '@/platform/kernel-config/cache-namespace';
import { compositionFingerprint } from '@/platform/kernel-config/composition-fingerprint';
import { createInternalFileOffloadResponse } from '@/platform/kernel-config/file-offload.server';
import { verifyRuntimeFilesystem } from '@/platform/kernel-config/filesystem.server';
import { assertTrustedHost, createHostPolicy, normalizeHost } from '@/platform/kernel-config/host-policy';
import {
  assertDeploymentCompatibility,
  createKernelConfiguration,
  deploymentCompatibilityContract,
} from '@/platform/kernel-config/kernel-configuration';
import { createLocaleConfiguration, resolveAcceptLanguage } from '@/platform/kernel-config/locale-config';
import { disabledMethodOverridePolicy, resolveLegacyMethod } from '@/platform/kernel-config/method-override';
import { resolveProjectPaths } from '@/platform/kernel-config/project-paths';
import { createProxyTrustPolicy, resolveClientAddress } from '@/platform/kernel-config/proxy-trust';
import { createRuntimeEnvironment } from '@/platform/kernel-config/runtime-environment';
import { createWorkerRuntimeMode } from '@/platform/kernel-config/runtime-mode';
import { createSecretKeyring } from '@/platform/kernel-config/secret-keyring.server';
import { safeStructuredLogRecord } from '@/platform/kernel-config/structured-log';
import { decodeUtf8, escapeSpreadsheetCell } from '@/platform/kernel-config/utf8';

const require = createRequire(import.meta.url);
const { createKernelNextConfig } = require(
  '../../../../src/platform/kernel-config/next-config.cjs',
) as Readonly<{
  createKernelNextConfig(input: Readonly<{
    applicationRoot: string;
    environment: Readonly<Record<string, string | undefined>>;
  }>): Readonly<Record<string, unknown>>;
}>;

const localEnvironment = {
  NODE_ENV: 'development',
  APP_STAGE: 'local',
  APP_URL: 'http://localhost:3000',
  APP_NAME: 'Winzard Test',
  APP_ID: 'winzard-test',
  LOG_LEVEL: 'error',
  GIT_COMMIT: '0000000',
  BUILD_ID: 'test-build',
  DEPLOYMENT_ID: 'test-deployment',
  SOURCE_DATE_EPOCH: '0',
  DEFAULT_LOCALE: 'hu',
  ENABLED_LOCALES: 'hu,en',
  TRUSTED_HOSTS: 'localhost:3000,*.preview.example.test',
  SERVER_ACTION_ALLOWED_ORIGINS: 'localhost:3000',
  TRUSTED_PROXY_MODE: 'none',
  CACHE_SCHEMA_VERSION: '1',
} as const;

describe('kernel configuration runtime contracts', () => {
  it('strict SOURCE_DATE_EPOCH és release identity contractot ad', () => {
    expect(parseSourceDateEpoch('0')).toBe(0);
    expect(() => parseSourceDateEpoch('1.5')).toThrow();
    expect(createBuildIdentity(localEnvironment, 'local')).toMatchObject({
      buildId: 'test-build',
      deploymentId: 'test-deployment',
      sourceDateEpoch: 0,
    });
    expect(() => createBuildIdentity({ ...localEnvironment, GIT_COMMIT: undefined }, 'production')).toThrow();
  });

  it('a buildkönyvtárat az application root alatt tartja és a symlink/escape inputot elutasítja', async () => {
    const repositoryRoot = await mkdtemp(path.join(os.tmpdir(), 'winzard-kernel-root-'));
    const applicationRoot = path.join(repositoryRoot, 'apps', 'reference');
    await mkdir(applicationRoot, { recursive: true });
    const paths = resolveProjectPaths({ repositoryRoot, applicationRoot, buildDirectory: '.next' });
    expect(paths.buildDirectoryRelative).toBe('.next');
    expect(() => resolveProjectPaths({
      repositoryRoot,
      applicationRoot,
      buildDirectory: '../../outside',
    })).toThrow();

    const outsideRoot = await mkdtemp(path.join(os.tmpdir(), 'winzard-kernel-outside-'));
    const symlinkedBuild = path.join(applicationRoot, 'linked-build');
    await symlink(
      outsideRoot,
      symlinkedBuild,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    expect(() => resolveProjectPaths({
      repositoryRoot,
      applicationRoot,
      buildDirectory: 'linked-build',
    })).toThrow();
  });

  it('külön kezeli a NODE_ENV és APP_STAGE értéket', () => {
    expect(createRuntimeEnvironment(localEnvironment)).toMatchObject({
      configuration: 'development',
      stage: 'local',
    });
    expect(() => createRuntimeEnvironment({
      ...localEnvironment,
      NODE_ENV: 'development',
      APP_STAGE: 'production',
    })).toThrow();
  });

  it('explicit és korlátozott worker runtime contractot ad', () => {
    expect(createWorkerRuntimeMode({ WORKER_CONCURRENCY: '8' })).toMatchObject({
      mode: 'worker',
      concurrency: 8,
    });
    expect(() => createWorkerRuntimeMode({ WORKER_CONCURRENCY: '0' })).toThrow();
  });

  it('zárt locale-listát és q-value alapú feloldást használ', () => {
    const configuration = createLocaleConfiguration(localEnvironment);
    expect(resolveAcceptLanguage('de-DE,de;q=0.9,en;q=0.8', configuration)).toBe('en');
    expect(resolveAcceptLanguage('en;q=0.2,hu;q=0.9', configuration)).toBe('hu');
    expect(() => createLocaleConfiguration({
      ...localEnvironment,
      DEFAULT_LOCALE: 'en',
      ENABLED_LOCALES: 'hu',
    })).toThrow();
  });

  it('normalizálja és allowlisttel ellenőrzi a Host értéket', () => {
    expect(normalizeHost('LOCALHOST:3000').authority).toBe('localhost:3000');
    const policy = createHostPolicy(localEnvironment, 'local');
    expect(assertTrustedHost('localhost:3000', policy).hostname).toBe('localhost');
    expect(assertTrustedHost('one.preview.example.test', policy).hostname).toBe('one.preview.example.test');
    expect(() => assertTrustedHost('a.b.preview.example.test', policy)).toThrow();
    expect(() => normalizeHost('example.test,attacker.invalid')).toThrow();
  });

  it('fixed-hop és CIDR proxy trust mellett determinisztikus klienscímet ad', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.10, 10.0.0.2' });
    expect(resolveClientAddress({
      headers,
      peerAddress: '10.0.0.3',
      policy: { mode: 'fixed-hops', hops: 2 },
    })).toBe('203.0.113.10');
    expect(resolveClientAddress({
      headers,
      peerAddress: '10.0.0.3',
      policy: { mode: 'cidr', cidrs: ['10.0.0.0/8'] },
    })).toBe('203.0.113.10');
    expect(() => createProxyTrustPolicy({
      TRUSTED_PROXY_MODE: 'cidr',
      TRUSTED_PROXY_CIDRS: '0.0.0.0/0',
    })).toThrow();
  });

  it('tenant- és deployment-scope-os cache namespace-t képez', () => {
    expect(createCacheNamespace({
      application: 'catalog',
      stage: 'staging',
      deploymentId: 'deploy-1',
      schemaVersion: 3,
      tenantId: 'acme',
      locale: 'hu',
    })).toBe('catalog:staging:v3:deploy-1:tenant:acme:locale:hu');
  });

  it('shared-cache tag invalidációt több adapterfogyasztó számára is konzisztensen végez', async () => {
    const store = createInMemorySharedCacheStore<{ version: number }>();
    const firstInstance = createInMemorySharedCache(store);
    const secondInstance = createInMemorySharedCache(store);
    await firstInstance.set('catalog:item:1', { version: 1 }, { tags: ['catalog-item'] });
    expect(await secondInstance.get('catalog:item:1')).toEqual({ version: 1 });
    await secondInstance.invalidateTag('catalog-item');
    expect(await firstInstance.get('catalog:item:1')).toBeNull();
  });

  it('canonical és sorrendfüggetlen composition fingerprintet képez', () => {
    const left = compositionFingerprint([
      { operationId: 'b', portId: 'p', adapterId: 'a', packageVersion: '1', capability: 'x', lifetime: 'singleton', configSchemaVersion: 1 },
      { operationId: 'a', portId: 'p', adapterId: 'a', packageVersion: '1', capability: 'x', lifetime: 'singleton', configSchemaVersion: 1 },
    ]);
    const right = compositionFingerprint([
      { operationId: 'a', portId: 'p', adapterId: 'a', packageVersion: '1', capability: 'x', lifetime: 'singleton', configSchemaVersion: 1 },
      { operationId: 'b', portId: 'p', adapterId: 'a', packageVersion: '1', capability: 'x', lifetime: 'singleton', configSchemaVersion: 1 },
    ]);
    expect(left).toBe(right);
  });

  it('aktív és previous kulcsos, raw értéket nem publikáló keyringet képez', () => {
    const first = Buffer.from(Array.from({ length: 32 }, (_, index) => index + 1)).toString('base64url');
    const second = Buffer.from(Array.from({ length: 32 }, (_, index) => 255 - index)).toString('base64url');
    const keyring = createSecretKeyring({
      capability: 'session',
      activeKeyId: 'v2',
      previousKeyIds: ['v1'],
      keys: { v1: first, v2: second },
    });
    expect(keyring.activeKeyId).toBe('v2');
    expect(keyring.previousKeyIds).toEqual(['v1']);
    const exposed = keyring.keys.get('v2');
    expect(exposed).toBeDefined();
    if (exposed) exposed.fill(0);
    expect([...keyring.keys.get('v2') ?? []]).toEqual([...Buffer.from(second, 'base64url')]);
    expect('set' in keyring.keys).toBe(false);
    expect(JSON.stringify(keyring)).not.toContain(first);
    expect(() => createSecretKeyring({
      capability: 'session',
      activeKeyId: 'v1',
      keys: { v1: `${first}=invalid` },
    })).toThrow(/base64url/u);
  });

  it('alapértelmezetten tiltja a method override-ot', () => {
    const request = new Request('https://example.test', {
      method: 'POST',
      headers: { 'x-http-method-override': 'DELETE' },
    });
    expect(() => resolveLegacyMethod(request, disabledMethodOverridePolicy)).toThrow();
    expect(resolveLegacyMethod(new Request('https://example.test', { method: 'POST' }), {
      enabled: true,
      allowedMethods: ['DELETE'],
    })).toBe('POST');
  });

  it('csak belső URI-t állít elő file offloadhoz', () => {
    const response = createInternalFileOffloadResponse({
      storageKey: 'tenant/acme/report-1',
      downloadName: 'report.csv',
      contentType: 'text/csv; charset=utf-8',
    }, {
      mode: 'x-accel-redirect',
      internalPrefix: '/__internal/files',
    });
    expect(response.headers.get('x-accel-redirect')).toBe('/__internal/files/tenant/acme/report-1');
    expect(() => createInternalFileOffloadResponse({
      storageKey: '../etc/passwd',
      downloadName: 'x',
      contentType: 'text/plain',
    }, { mode: 'x-sendfile', internalPrefix: '/internal' })).toThrow();
  });

  it('szigorú UTF-8 és spreadsheet injection boundaryt tart fenn', () => {
    expect(decodeUtf8(new TextEncoder().encode('árvíztűrő'))).toBe('árvíztűrő');
    expect(() => decodeUtf8(Uint8Array.from([0xc3, 0x28]))).toThrow();
    expect(escapeSpreadsheetCell('=SUM(A1:A2)')).toBe("'=SUM(A1:A2)");
  });

  it('tényleges íráspróbával ellenőrzi a read-only artifact és a külső writable root határát', async () => {
    const applicationRoot = await mkdtemp(path.join(os.tmpdir(), 'winzard-artifact-'));
    const writableRoot = await mkdtemp(path.join(os.tmpdir(), 'winzard-runtime-'));
    await expect(verifyRuntimeFilesystem({
      applicationRoot,
      writableRoot,
      requireReadOnlyApplication: false,
    })).resolves.toBeUndefined();
    await expect(verifyRuntimeFilesystem({
      applicationRoot,
      writableRoot,
      requireReadOnlyApplication: true,
    })).rejects.toThrow(/read-only/u);
  });

  it('a tényleges Next.js config adapter ugyanazt a build- és origin contractot érvényesíti', () => {
    const config = createKernelNextConfig({
      applicationRoot: '/tmp/winzard-app',
      environment: localEnvironment,
    });
    expect(config).toMatchObject({
      distDir: '.next',
      typedRoutes: true,
      poweredByHeader: false,
      deploymentId: 'test-deployment',
    });
    expect(config.generateBuildId).toBeTypeOf('function');
    expect(() => createKernelNextConfig({
      applicationRoot: '/tmp/winzard-app',
      environment: { ...localEnvironment, NEXT_DIST_DIR: '../../escape' },
    })).toThrow(/application root/u);
    const releaseEnvironment = {
      ...localEnvironment,
      NODE_ENV: 'production',
      APP_STAGE: 'staging',
      APP_URL: 'https://app.example.test',
      TRUSTED_HOSTS: 'app.example.test',
      SERVER_ACTION_ALLOWED_ORIGINS: 'app.example.test',
      GIT_COMMIT: '0123456789abcdef',
      NEXT_SERVER_ACTIONS_ENCRYPTION_KEY:
        Buffer.from('0123456789abcdef0123456789abcdef').toString('base64'),
    } as const;
    expect(() => createKernelNextConfig({
      applicationRoot: '/tmp/winzard-app',
      environment: releaseEnvironment,
    })).not.toThrow();
    expect(() => createKernelNextConfig({
      applicationRoot: '/tmp/winzard-app',
      environment: {
        ...releaseEnvironment,
        NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: undefined,
      },
    })).toThrow(/NEXT_SERVER_ACTIONS_ENCRYPTION_KEY/u);
  });

  it('azonos rollout minden példányán egyező deployment contractot követel', () => {
    const configuration = createKernelConfiguration({
      applicationRoot: '/tmp/winzard-app',
      runtimeMode: 'web',
      environment: localEnvironment,
    });
    const expected = deploymentCompatibilityContract(configuration);
    expect(() => assertDeploymentCompatibility(expected, expected)).not.toThrow();
    expect(() => assertDeploymentCompatibility(expected, {
      ...expected,
      deploymentId: 'different-rollout',
    })).toThrow(/deploymentId/u);
  });

  it('a strukturált logger rekurzívan redaktál és eltávolítja a log injection karaktereket', () => {
    const record = safeStructuredLogRecord({
      level: 'error',
      event: 'request\nfailed',
      timestamp: '2026-07-22T00:00:00.000Z',
      buildId: 'test-build',
      deploymentId: 'test-deployment',
      runtimeMode: 'web',
      fields: {
        nested: { authorization: 'Bearer secret', safe: 'line\r\nvalue' },
      },
    });
    expect(record.event).toBe('requestfailed');
    expect(record.fields).toEqual({
      nested: { authorization: '[redacted]', safe: 'linevalue' },
    });
  });
});
