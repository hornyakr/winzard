import { createHash } from 'node:crypto';

import type { CompositionRootRecord, CompositionServiceRecord } from './types';

function canonicalRoot(root: CompositionRootRecord): Record<string, unknown> {
  return {
    id: root.id,
    source: root.source,
    exportName: root.exportName,
    runtime: root.runtime,
    services: [...root.services].sort(),
  };
}

function canonicalService(service: CompositionServiceRecord): Record<string, unknown> {
  return {
    id: service.id,
    capability: service.capability,
    kind: service.kind,
    implementation: service.implementation,
    port: service.port,
    source: service.source,
    exportName: service.exportName,
    lifetime: service.lifetime,
    runtime: service.runtime,
    visibility: service.visibility,
    dependencies: [...service.dependencies].sort(),
    decorators: [...service.decorators],
    aliases: [...service.aliases].sort(),
    tags: [...service.tags].sort(),
    priority: service.priority,
    configKeys: [...service.configKeys].sort(),
    secretKeys: [...service.secretKeys].sort(),
    disposable: service.disposable,
    requestState: service.requestState,
  };
}

export function canonicalCompositionGraph(
  roots: readonly CompositionRootRecord[],
  services: readonly CompositionServiceRecord[],
): string {
  return JSON.stringify({
    schemaVersion: 1,
    roots: [...roots]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(canonicalRoot),
    services: [...services]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(canonicalService),
  });
}

export function compositionFingerprint(
  roots: readonly CompositionRootRecord[],
  services: readonly CompositionServiceRecord[],
): string {
  return createHash('sha256')
    .update(canonicalCompositionGraph(roots, services))
    .digest('hex');
}
