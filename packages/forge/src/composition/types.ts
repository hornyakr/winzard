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

export type CompositionLifetime = (typeof COMPOSITION_LIFETIMES)[number];
export type CompositionRuntime = (typeof COMPOSITION_RUNTIMES)[number];
export type CompositionKind = (typeof COMPOSITION_KINDS)[number];
export type CompositionVisibility = (typeof COMPOSITION_VISIBILITIES)[number];

export type CompositionRootRecord = Readonly<{
  id: string;
  definitionId: string;
  definitionFile: string;
  source: string;
  exportName: string;
  runtime: CompositionRuntime;
  services: readonly string[];
}>;

export type CompositionServiceRecord = Readonly<{
  id: string;
  definitionId: string;
  definitionFile: string;
  capability: string;
  kind: CompositionKind;
  implementation: string;
  port: string | null;
  source: string;
  exportName: string | null;
  lifetime: CompositionLifetime;
  runtime: CompositionRuntime;
  visibility: CompositionVisibility;
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

export type CompositionDefinitionRecord = Readonly<{
  id: string;
  capability: string;
  file: string;
  exportName: string;
  roots: readonly string[];
  services: readonly string[];
}>;

export type CompositionIssueSeverity = 'error' | 'warning';
export type CompositionIssueArea =
  | 'binding'
  | 'contract'
  | 'generation'
  | 'lifetime'
  | 'runtime'
  | 'security';

export type CompositionIssue = Readonly<{
  severity: CompositionIssueSeverity;
  area: CompositionIssueArea;
  code: string;
  file: string;
  message: string;
  serviceId?: string;
}>;

export type CompositionInventory = Readonly<{
  schemaVersion: 1;
  projectRoot: '.';
  definitions: readonly CompositionDefinitionRecord[];
  roots: readonly CompositionRootRecord[];
  services: readonly CompositionServiceRecord[];
  issues: readonly CompositionIssue[];
  fingerprint: string;
}>;
