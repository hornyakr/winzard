import { createBuildIdentity, type BuildIdentity } from './build-identity';
import { KernelConfigurationError } from './kernel-config.errors';
import { createCacheNamespace } from './cache-namespace';
import {
  compositionFingerprint,
  type CompositionEntry,
} from './composition-fingerprint';
import { createHostPolicy, type HostPolicy } from './host-policy';
import {
  createLocaleConfiguration,
  type LocaleConfiguration,
} from './locale-config';
import {
  resolveProjectPaths,
  type ProjectPaths,
} from './project-paths';
import {
  createProxyTrustPolicy,
  type ProxyTrustPolicy,
} from './proxy-trust';
import {
  createRuntimeEnvironment,
  type RuntimeEnvironment,
} from './runtime-environment';
import {
  createRuntimeMode,
  type RuntimeMode,
  type RuntimeModeContext,
} from './runtime-mode';

export type KernelConfiguration = Readonly<{
  paths: ProjectPaths;
  identity: BuildIdentity & Readonly<{ compositionHash: string }>;
  environment: RuntimeEnvironment;
  runtime: RuntimeModeContext;
  locales: LocaleConfiguration;
  hosts: HostPolicy;
  proxy: ProxyTrustPolicy;
  cacheNamespace: string;
}>;

const defaultCompositionEntries: readonly CompositionEntry[] = Object.freeze([
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

export function createKernelConfiguration(input: Readonly<{
  applicationRoot: string;
  repositoryRoot?: string;
  runtimeMode: RuntimeMode;
  environment?: NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>>;
  compositionEntries?: readonly CompositionEntry[];
}>): KernelConfiguration {
  const environmentInput = input.environment ?? process.env;
  const environment = createRuntimeEnvironment(environmentInput);
  const paths = resolveProjectPaths({
    applicationRoot: input.applicationRoot,
    ...(input.repositoryRoot ? { repositoryRoot: input.repositoryRoot } : {}),
    buildDirectory: environmentInput.NEXT_DIST_DIR ?? '.next',
  });
  const identityBase = createBuildIdentity(environmentInput, environment.stage);
  const compositionHash = compositionFingerprint(
    input.compositionEntries ?? defaultCompositionEntries,
  );
  const expectedCompositionHash = environmentInput.COMPOSITION_HASH?.trim();
  if (expectedCompositionHash && expectedCompositionHash !== 'auto' && expectedCompositionHash !== compositionHash) {
    throw new KernelConfigurationError(
      'KERNEL_COMPOSITION_HASH_DRIFT',
      'A runtime composition fingerprint eltér a deployment contracttól.',
    );
  }
  const locales = createLocaleConfiguration(environmentInput);
  const hosts = createHostPolicy(environmentInput, environment.stage);
  const proxy = createProxyTrustPolicy(environmentInput);
  const runtime = createRuntimeMode(input.runtimeMode);
  const cacheNamespace = createCacheNamespace({
    application: environmentInput.APP_ID ?? 'winzard',
    stage: environment.stage,
    deploymentId: identityBase.deploymentId,
    schemaVersion: Number(environmentInput.CACHE_SCHEMA_VERSION ?? '1'),
  });
  return Object.freeze({
    paths,
    identity: Object.freeze({ ...identityBase, compositionHash }),
    environment,
    runtime,
    locales,
    hosts,
    proxy,
    cacheNamespace,
  });
}


export type DeploymentCompatibilityContract = Readonly<{
  buildId: string;
  deploymentId: string;
  compositionHash: string;
  cacheNamespace: string;
  locales: readonly string[];
}>;

export function deploymentCompatibilityContract(
  configuration: KernelConfiguration,
): DeploymentCompatibilityContract {
  return Object.freeze({
    buildId: configuration.identity.buildId,
    deploymentId: configuration.identity.deploymentId,
    compositionHash: configuration.identity.compositionHash,
    cacheNamespace: configuration.cacheNamespace,
    locales: Object.freeze([...configuration.locales.enabledLocales]),
  });
}

export function assertDeploymentCompatibility(
  expected: DeploymentCompatibilityContract,
  actual: DeploymentCompatibilityContract,
): void {
  const differences = (Object.keys(expected) as (keyof DeploymentCompatibilityContract)[])
    .filter((key) => JSON.stringify(expected[key]) !== JSON.stringify(actual[key]));
  if (differences.length > 0) {
    throw new KernelConfigurationError(
      'KERNEL_DEPLOYMENT_ID_INCONSISTENT',
      `A rollout instance contractja eltér: ${differences.join(', ')}.`,
    );
  }
}
