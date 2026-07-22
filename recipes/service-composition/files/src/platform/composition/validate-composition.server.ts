import 'server-only';

import graphManifestJson from '@/generated/composition/graph-manifest.json';
import {
  generatedCompositionFingerprint,
  generatedCompositionRegistry,
  generatedCompositionRootInstances,
  generatedCompositionRoots,
} from '@/generated/composition/registry';

import {
  COMPOSITION_LIFETIMES,
  COMPOSITION_RUNTIMES,
  type RuntimeCompositionLifetime,
  type RuntimeCompositionManifest,
  type RuntimeCompositionService,
} from './contract';
import { compositionFingerprint } from './fingerprint';

export class CompositionValidationError extends Error {
  constructor(readonly code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = 'CompositionValidationError';
  }
}

function lifetimeRank(lifetime: RuntimeCompositionLifetime): number {
  if (lifetime === 'static' || lifetime === 'external') return 0;
  if (lifetime === 'process') return 1;
  if (lifetime === 'request') return 2;
  return 3;
}

function manifest(): RuntimeCompositionManifest {
  const value = graphManifestJson as unknown as RuntimeCompositionManifest;
  if (value.schemaVersion !== 1 || !Array.isArray(value.roots) || !Array.isArray(value.services)) {
    throw new CompositionValidationError('COMPOSITION_MANIFEST_INVALID', 'A generated graph manifest szerkezete érvénytelen.');
  }
  return value;
}

function assertServiceShape(service: RuntimeCompositionService): void {
  if (!service.id || !service.implementation || !service.source) {
    throw new CompositionValidationError('COMPOSITION_SERVICE_INVALID', 'A service ID, implementation és source kötelező.');
  }
  if (!COMPOSITION_LIFETIMES.includes(service.lifetime) || !COMPOSITION_RUNTIMES.includes(service.runtime)) {
    throw new CompositionValidationError('COMPOSITION_SERVICE_INVALID', `Érvénytelen lifetime vagy runtime: ${service.id}.`);
  }
  if (service.secretKeys.some((key) => key.includes('=') || key.includes('://'))) {
    throw new CompositionValidationError('COMPOSITION_SECRET_EXPOSED', `A graph secret értéket tartalmazhat: ${service.id}.`);
  }
}

export async function validateComposition(
  input: NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>> = process.env,
): Promise<void> {
  const value = manifest();
  const services = new Map<string, RuntimeCompositionService>();
  for (const service of value.services) {
    assertServiceShape(service);
    if (services.has(service.id)) {
      throw new CompositionValidationError('COMPOSITION_DUPLICATE_SERVICE_ID', service.id);
    }
    services.set(service.id, service);
  }
  for (const root of value.roots) {
    for (const service of root.services) {
      if (!services.has(service)) {
        throw new CompositionValidationError('COMPOSITION_UNKNOWN_SERVICE_REFERENCE', `${root.id} → ${service}`);
      }
    }
  }
  for (const service of value.services) {
    for (const dependencyId of service.dependencies) {
      const dependency = services.get(dependencyId);
      if (!dependency) {
        throw new CompositionValidationError('COMPOSITION_BINDING_MISSING', `${service.id} → ${dependencyId}`);
      }
      if (lifetimeRank(service.lifetime) < lifetimeRank(dependency.lifetime)) {
        throw new CompositionValidationError('COMPOSITION_LIFETIME_MISMATCH', `${service.id} → ${dependency.id}`);
      }
      if (
        (service.runtime === 'edge' && dependency.runtime === 'nodejs') ||
        (service.runtime === 'universal' && dependency.runtime !== 'universal')
      ) {
        throw new CompositionValidationError('COMPOSITION_RUNTIME_MISMATCH', `${service.id} → ${dependency.id}`);
      }
    }
    if (service.lifetime === 'process' && service.requestState) {
      throw new CompositionValidationError('COMPOSITION_REQUEST_STATE_IN_SINGLETON', service.id);
    }
  }

  const state = new Map<string, 0 | 1 | 2>();
  const visit = (id: string, chain: readonly string[]): void => {
    const current = state.get(id) ?? 0;
    if (current === 2) return;
    if (current === 1) {
      throw new CompositionValidationError('COMPOSITION_CYCLE', [...chain, id].join(' → '));
    }
    state.set(id, 1);
    for (const dependency of services.get(id)?.dependencies ?? []) visit(dependency, [...chain, id]);
    state.set(id, 2);
  };
  for (const id of [...services.keys()].sort()) visit(id, []);

  const startupRoots = value.roots.filter(({ runtime }) => runtime !== 'edge');
  const fingerprint = compositionFingerprint(value.roots, value.services);
  if (value.fingerprint !== fingerprint || generatedCompositionFingerprint !== fingerprint) {
    throw new CompositionValidationError('COMPOSITION_FINGERPRINT_DRIFT', 'A generated graph és registry fingerprintje eltér.');
  }
  if (
    generatedCompositionRegistry.length !== value.services.length ||
    generatedCompositionRoots.length !== value.roots.length ||
    generatedCompositionRootInstances.length !== startupRoots.length
  ) {
    throw new CompositionValidationError('COMPOSITION_REGISTRY_DRIFT', 'A generated registry és graph manifest elemszáma eltér.');
  }
  for (const [index, root] of startupRoots.entries()) {
    const binding = generatedCompositionRootInstances[index];
    const validValue = binding && (
      typeof binding.value === 'function' ||
      (typeof binding.value === 'object' && binding.value !== null)
    );
    if (binding?.id !== root.id || !validValue) {
      throw new CompositionValidationError('COMPOSITION_ROOT_SMOKE_FAILED', `A generated runtime-kompatibilis composition root binding érvénytelen: ${root.id}.`);
    }
  }
  const expected = input.COMPOSITION_HASH?.trim();
  if (expected && expected !== 'auto' && expected !== fingerprint) {
    throw new CompositionValidationError('COMPOSITION_HASH_DRIFT', 'A runtime composition fingerprint eltér a deployment contracttól.');
  }
}
