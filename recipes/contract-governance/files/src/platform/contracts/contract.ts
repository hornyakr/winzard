export const CONTRACT_CATEGORIES = [
  'compile-time',
  'runtime-data',
  'behavioral',
  'package',
  'protocol',
  'capability',
  'documentation-ai',
] as const;

export type ContractCategory = (typeof CONTRACT_CATEGORIES)[number];
export type ContractStability = 'experimental' | 'stable' | 'deprecated';
export type ContractVisibility = 'module' | 'cross-module' | 'public-package' | 'protocol';

export type ContractDefinitionEntry = Readonly<{
  id: string;
  owner: string;
  version: string;
  stability: ContractStability;
  visibility: ContractVisibility;
  categories: readonly ContractCategory[];
  source: string;
  export: string;
  documentation: string;
  runtimeValidation: 'schema' | 'not-applicable';
  runtimeSchema: string | null;
  errorCodes: readonly string[];
  cancellation: 'abort-signal' | 'unsupported' | 'not-applicable';
  timeout: 'deadline' | 'bounded' | 'not-applicable';
  concurrency: 'reentrant' | 'single-use' | 'request-scoped' | 'documented';
  idempotency: 'idempotent' | 'non-idempotent' | 'conditional' | 'not-applicable';
  securityClassification: 'public' | 'internal' | 'confidential' | 'restricted';
  tenantScope: 'tenant-scoped' | 'global' | 'not-applicable';
  referenceSuite: string | null;
  deprecation: Readonly<{
    since: string;
    removal: string;
    replacement: string | null;
    migration: string | null;
  }> | null;
}>;

export type ContractDefinition = Readonly<{
  schemaVersion: 1;
  id: string;
  contracts: readonly ContractDefinitionEntry[];
}>;

export type ContractProviderEntry = Readonly<{
  id: string;
  contract: string;
  contractMajor: number;
  version: string;
  kind: 'production' | 'fake' | 'decorator';
  source: string;
  export: string;
  runtime: 'universal' | 'nodejs' | 'edge';
  capabilities: readonly string[];
  referenceSuite: string | null;
  compositionServiceId: string | null;
}>;

export type ContractProviderDefinition = Readonly<{
  schemaVersion: 1;
  id: string;
  providers: readonly ContractProviderEntry[];
}>;

export function defineContracts<T extends ContractDefinition>(definition: T): T {
  return definition;
}

export function defineContractProviders<T extends ContractProviderDefinition>(definition: T): T {
  return definition;
}
