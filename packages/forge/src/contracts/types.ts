export const CONTRACT_CATEGORIES = [
  'compile-time',
  'runtime-data',
  'behavioral',
  'package',
  'protocol',
  'capability',
  'documentation-ai',
] as const;

export const CONTRACT_STABILITIES = ['experimental', 'stable', 'deprecated'] as const;
export const CONTRACT_VISIBILITIES = ['module', 'cross-module', 'public-package', 'protocol'] as const;
export const CONTRACT_RUNTIME_VALIDATION = ['schema', 'not-applicable'] as const;
export const CONTRACT_CANCELLATION = ['abort-signal', 'unsupported', 'not-applicable'] as const;
export const CONTRACT_TIMEOUTS = ['deadline', 'bounded', 'not-applicable'] as const;
export const CONTRACT_CONCURRENCY = ['reentrant', 'single-use', 'request-scoped', 'documented'] as const;
export const CONTRACT_IDEMPOTENCY = ['idempotent', 'non-idempotent', 'conditional', 'not-applicable'] as const;
export const CONTRACT_CLASSIFICATIONS = ['public', 'internal', 'confidential', 'restricted'] as const;
export const CONTRACT_TENANT_SCOPES = ['tenant-scoped', 'global', 'not-applicable'] as const;
export const CONTRACT_PROVIDER_KINDS = ['production', 'fake', 'decorator'] as const;
export const CONTRACT_RUNTIMES = ['universal', 'nodejs', 'edge'] as const;

export type ContractCategory = (typeof CONTRACT_CATEGORIES)[number];
export type ContractStability = (typeof CONTRACT_STABILITIES)[number];
export type ContractVisibility = (typeof CONTRACT_VISIBILITIES)[number];
export type ContractRuntimeValidation = (typeof CONTRACT_RUNTIME_VALIDATION)[number];
export type ContractCancellation = (typeof CONTRACT_CANCELLATION)[number];
export type ContractTimeout = (typeof CONTRACT_TIMEOUTS)[number];
export type ContractConcurrency = (typeof CONTRACT_CONCURRENCY)[number];
export type ContractIdempotency = (typeof CONTRACT_IDEMPOTENCY)[number];
export type ContractClassification = (typeof CONTRACT_CLASSIFICATIONS)[number];
export type ContractTenantScope = (typeof CONTRACT_TENANT_SCOPES)[number];
export type ContractProviderKind = (typeof CONTRACT_PROVIDER_KINDS)[number];
export type ContractRuntime = (typeof CONTRACT_RUNTIMES)[number];

export type ContractDeprecation = Readonly<{
  since: string;
  removal: string;
  replacement: string | null;
  migration: string | null;
}>;

export type ContractDefinitionRecord = Readonly<{
  definitionId: string;
  definitionFile: string;
  id: string;
  owner: string;
  version: string;
  major: number;
  stability: ContractStability;
  visibility: ContractVisibility;
  categories: readonly ContractCategory[];
  source: string;
  exportName: string;
  documentation: string;
  runtimeValidation: ContractRuntimeValidation;
  runtimeSchema: string | null;
  errorCodes: readonly string[];
  cancellation: ContractCancellation;
  timeout: ContractTimeout;
  concurrency: ContractConcurrency;
  idempotency: ContractIdempotency;
  securityClassification: ContractClassification;
  tenantScope: ContractTenantScope;
  referenceSuite: string | null;
  deprecation: ContractDeprecation | null;
}>;

export type ContractProviderRecord = Readonly<{
  definitionId: string;
  definitionFile: string;
  id: string;
  contractId: string;
  contractMajor: number;
  version: string;
  kind: ContractProviderKind;
  source: string;
  exportName: string;
  runtime: ContractRuntime;
  capabilities: readonly string[];
  referenceSuite: string | null;
  compositionServiceId: string | null;
}>;

export type ContractDefinitionFileRecord = Readonly<{
  id: string;
  file: string;
  exportName: string;
  contracts: readonly string[];
}>;

export type ContractProviderFileRecord = Readonly<{
  id: string;
  file: string;
  exportName: string;
  providers: readonly string[];
}>;

export type ContractIssueSeverity = 'error' | 'warning';
export type ContractIssueArea = 'contract' | 'provider' | 'source' | 'compatibility' | 'generation' | 'security' | 'deprecation';

export type ContractIssue = Readonly<{
  severity: ContractIssueSeverity;
  area: ContractIssueArea;
  code: string;
  file: string;
  message: string;
  contractId?: string;
  providerId?: string;
}>;

export type ContractInventory = Readonly<{
  schemaVersion: 1;
  projectRoot: '.';
  definitions: readonly ContractDefinitionFileRecord[];
  providerDefinitions: readonly ContractProviderFileRecord[];
  contracts: readonly ContractDefinitionRecord[];
  providers: readonly ContractProviderRecord[];
  issues: readonly ContractIssue[];
  fingerprint: string;
}>;

export type ContractManifest = Readonly<{
  schemaVersion: 1;
  fingerprint: string;
  contracts: readonly ContractDefinitionRecord[];
  providers: readonly ContractProviderRecord[];
}>;

export type ContractCompatibilityChange = Readonly<{
  severity: 'breaking' | 'non-breaking' | 'warning';
  code: string;
  contractId: string;
  message: string;
}>;

export type ContractCompatibilityResult = Readonly<{
  base: string;
  currentFingerprint: string;
  baselineFingerprint: string | null;
  compatible: boolean;
  changes: readonly ContractCompatibilityChange[];
  issues: readonly ContractIssue[];
}>;
