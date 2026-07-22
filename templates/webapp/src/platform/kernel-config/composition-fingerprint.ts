import { createHash } from 'node:crypto';

export type CompositionEntry = Readonly<{
  operationId: string;
  portId: string;
  adapterId: string;
  packageVersion: string;
  capability: string;
  lifetime: 'singleton' | 'request' | 'transient';
  decorators?: readonly string[];
  configSchemaVersion: number;
}>;

function canonicalEntry(entry: CompositionEntry): Record<string, unknown> {
  return {
    operationId: entry.operationId,
    portId: entry.portId,
    adapterId: entry.adapterId,
    packageVersion: entry.packageVersion,
    capability: entry.capability,
    lifetime: entry.lifetime,
    decorators: [...(entry.decorators ?? [])],
    configSchemaVersion: entry.configSchemaVersion,
  };
}

export function canonicalCompositionGraph(entries: readonly CompositionEntry[]): string {
  return JSON.stringify(
    [...entries]
      .sort((left, right) =>
        left.operationId.localeCompare(right.operationId) ||
        left.portId.localeCompare(right.portId) ||
        left.adapterId.localeCompare(right.adapterId))
      .map(canonicalEntry),
  );
}

export function compositionFingerprint(entries: readonly CompositionEntry[]): string {
  return createHash('sha256')
    .update(canonicalCompositionGraph(entries))
    .digest('hex');
}
