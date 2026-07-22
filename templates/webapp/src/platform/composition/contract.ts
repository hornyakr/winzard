export const COMPOSITION_LIFETIMES = [
  'static',
  'process',
  'request',
  'operation',
  'external',
] as const;

export const COMPOSITION_RUNTIMES = ['nodejs', 'edge', 'universal'] as const;

export const COMPOSITION_KINDS = [
  'application',
  'infrastructure',
  'platform',
  'factory',
  'provider',
  'registry',
  'decorator',
] as const;

export const COMPOSITION_VISIBILITIES = ['public', 'private'] as const;

export type RuntimeCompositionLifetime = (typeof COMPOSITION_LIFETIMES)[number];
export type RuntimeCompositionRuntime = (typeof COMPOSITION_RUNTIMES)[number];
export type RuntimeCompositionKind = (typeof COMPOSITION_KINDS)[number];
export type RuntimeCompositionVisibility = (typeof COMPOSITION_VISIBILITIES)[number];

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
  kind: RuntimeCompositionKind;
  implementation: string;
  port: string | null;
  source: string;
  exportName: string | null;
  lifetime: RuntimeCompositionLifetime;
  runtime: RuntimeCompositionRuntime;
  visibility: RuntimeCompositionVisibility;
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

export type CompositionRootDefinition = Readonly<{
  id: string;
  source: string;
  export: string;
  runtime: RuntimeCompositionRuntime;
  services: readonly string[];
}>;

export type CompositionServiceDefinition = Readonly<{
  id: string;
  kind: RuntimeCompositionKind;
  implementation: string;
  port?: string | null;
  source: string;
  export?: string | null;
  lifetime: RuntimeCompositionLifetime;
  runtime: RuntimeCompositionRuntime;
  visibility: RuntimeCompositionVisibility;
  dependencies?: readonly string[];
  decorators?: readonly string[];
  aliases?: readonly string[];
  tags?: readonly string[];
  priority?: number;
  configKeys?: readonly string[];
  secretKeys?: readonly string[];
  disposable?: boolean;
  requestState?: boolean;
}>;

export type CompositionDefinition = Readonly<{
  schemaVersion: 1;
  id: string;
  capability: string;
  roots: readonly CompositionRootDefinition[];
  services: readonly CompositionServiceDefinition[];
}>;

export function defineComposition(definition: CompositionDefinition): CompositionDefinition {
  return definition;
}
