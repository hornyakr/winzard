export const COMPOSITION_LIFETIMES = [
  'static',
  'process',
  'request',
  'operation',
  'external',
] as const;

export const COMPOSITION_RUNTIMES = ['nodejs', 'edge', 'universal'] as const;

export type RuntimeCompositionLifetime = (typeof COMPOSITION_LIFETIMES)[number];
export type RuntimeCompositionRuntime = (typeof COMPOSITION_RUNTIMES)[number];

export type RuntimeCompositionRoot = Readonly<{
  id: string;
  source: string;
  exportName: string;
  runtime: RuntimeCompositionRuntime;
  services: readonly string[];
}>;

export type RuntimeCompositionService = Readonly<{
  id: string;
  capability: string;
  kind: string;
  implementation: string;
  port: string | null;
  source: string;
  exportName: string | null;
  lifetime: RuntimeCompositionLifetime;
  runtime: RuntimeCompositionRuntime;
  visibility: 'public' | 'private';
  dependencies: readonly string[];
  decorators: readonly string[];
  aliases: readonly string[];
  tags: readonly string[];
  priority: number;
  configKeys: readonly string[];
  secretKeys: readonly string[];
  disposable: boolean;
  requestState: boolean;
}>;

export type RuntimeCompositionManifest = Readonly<{
  schemaVersion: 1;
  fingerprint: string;
  roots: readonly RuntimeCompositionRoot[];
  services: readonly RuntimeCompositionService[];
}>;

export type CompositionDefinition = Readonly<{
  schemaVersion: 1;
  id: string;
  capability: string;
  roots: readonly Readonly<Record<string, unknown>>[];
  services: readonly Readonly<Record<string, unknown>>[];
}>;

export function defineComposition<const T extends CompositionDefinition>(definition: T): T {
  return definition;
}
