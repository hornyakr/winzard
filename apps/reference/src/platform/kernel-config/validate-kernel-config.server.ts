import 'server-only';

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createAppConfig } from '@/platform/config/app-env';

import { createBuildIdentity } from './build-identity';
import { createCacheNamespace } from './cache-namespace';
import {
  compositionFingerprint,
  type CompositionEntry,
} from './composition-fingerprint';
import { createHostPolicy } from './host-policy';
import { KernelConfigurationError } from './kernel-config.errors';
import { createLocaleConfiguration } from './locale-config';
import { createProxyTrustPolicy } from './proxy-trust';
import { createRuntimeEnvironment } from './runtime-environment';
import { createWebRuntimeMode } from './runtime-mode';
import { verifyRuntimeWritableRoot } from './runtime-writable-root.server';

const startupCompositionEntries: readonly CompositionEntry[] = Object.freeze([
  Object.freeze({
    operationId: 'kernel.configuration',
    portId: 'kernel.configuration',
    adapterId: 'winzard.kernel-configuration.v1',
    packageVersion: '0.1.0',
    capability: 'kernel-configuration',
    lifetime: 'singleton',
    configSchemaVersion: 1,
  }),
]);

function contained(root: string, target: string): boolean {
  const relative = path.relative(
    path.resolve(/* turbopackIgnore: true */ root),
    path.resolve(/* turbopackIgnore: true */ target),
  );
  return relative === '' || (
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function positiveInteger(value: string | undefined, fallback: number, key: string): number {
  const raw = value ?? String(fallback);
  const parsed = Number(raw);
  if (!/^\d+$/u.test(raw) || !Number.isSafeInteger(parsed) || parsed < 1) {
    throw new KernelConfigurationError(
      'KERNEL_CACHE_NAMESPACE_MISSING',
      `${key} pozitív safe integer legyen.`,
    );
  }
  return parsed;
}

export async function validateKernelConfiguration(
  input: NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>> = process.env,
): Promise<void> {
  createAppConfig(input);
  const applicationRoot = path.resolve(
    /* turbopackIgnore: true */ path.dirname(fileURLToPath(import.meta.url)),
    '../../..',
  );
  const environment = createRuntimeEnvironment(input);
  const identity = createBuildIdentity(input, environment.stage);
  const buildDirectory = path.resolve(
    /* turbopackIgnore: true */ applicationRoot,
    input.NEXT_DIST_DIR?.trim() || '.next',
  );
  if (!contained(applicationRoot, buildDirectory)) {
    throw new KernelConfigurationError(
      'KERNEL_BUILD_DIR_OUTSIDE_PROJECT',
      'A buildkönyvtár az application rooton belül maradjon.',
    );
  }
  const writableRoot = path.resolve(
    /* turbopackIgnore: true */ input.RUNTIME_WRITABLE_ROOT?.trim() || '/tmp/winzard',
  );
  if (contained(applicationRoot, writableRoot)) {
    throw new KernelConfigurationError(
      'KERNEL_READ_ONLY_FILESYSTEM_VIOLATION',
      'A runtime írható root nem lehet az immutable application artifact alatt.',
    );
  }
  await verifyRuntimeWritableRoot(writableRoot);
  createLocaleConfiguration(input);
  createHostPolicy(input, environment.stage);
  createProxyTrustPolicy(input);
  createWebRuntimeMode();
  createCacheNamespace({
    application: input.APP_ID ?? 'winzard',
    stage: environment.stage,
    deploymentId: identity.deploymentId,
    schemaVersion: positiveInteger(input.CACHE_SCHEMA_VERSION, 1, 'CACHE_SCHEMA_VERSION'),
  });
  const compositionHash = compositionFingerprint(startupCompositionEntries);
  const expectedCompositionHash = input.COMPOSITION_HASH?.trim();
  if (
    expectedCompositionHash &&
    expectedCompositionHash !== 'auto' &&
    expectedCompositionHash !== compositionHash
  ) {
    throw new KernelConfigurationError(
      'KERNEL_COMPOSITION_HASH_DRIFT',
      'A runtime composition fingerprint eltér a deployment contracttól.',
    );
  }
}
