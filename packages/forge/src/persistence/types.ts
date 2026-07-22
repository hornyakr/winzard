export type PersistenceSeverity = 'error' | 'warning' | 'info';

export type PersistenceIssue = Readonly<{
  code: string;
  severity: PersistenceSeverity;
  file: string;
  message: string;
}>;

export type PrismaFieldRecord = Readonly<{
  name: string;
  type: string;
  optional: boolean;
  list: boolean;
  id: boolean;
  unique: boolean;
  relation: boolean;
  nativeType: string | null;
  mappedName: string | null;
  defaultValue: string | null;
}>;

export type PrismaModelRecord = Readonly<{
  name: string;
  mappedName: string | null;
  fields: readonly PrismaFieldRecord[];
  ids: readonly string[];
  uniqueConstraints: readonly (readonly string[])[];
  indexes: readonly (readonly string[])[];
}>;

export type PrismaEnumRecord = Readonly<{
  name: string;
  values: readonly string[];
}>;

export type PrismaSchemaInventory = Readonly<{
  file: string;
  provider: string | null;
  generatorProvider: string | null;
  models: readonly PrismaModelRecord[];
  enums: readonly PrismaEnumRecord[];
  fingerprint: string;
}>;

export type MigrationRisk = Readonly<{
  code: string;
  message: string;
}>;

export type MigrationRecord = Readonly<{
  id: string;
  file: string;
  sha256: string;
  statements: number;
  risks: readonly MigrationRisk[];
  approved: boolean;
}>;

export type RepositoryQueryDefinition = Readonly<{
  id: string;
  bounded: boolean;
  tenantScoped: boolean;
  stableOrder: readonly string[];
  requiredIndexes: readonly string[];
}>;

export type RepositoryDefinition = Readonly<{
  schemaVersion: 1;
  id: string;
  port: string;
  adapter: string;
  models: readonly string[];
  role: 'read' | 'write' | 'read-write';
  tenantScoped: boolean;
  softDelete: boolean;
  optimisticConcurrency: boolean;
  transaction: 'none' | 'supported' | 'required';
  queries: readonly RepositoryQueryDefinition[];
}>;

export type RepositoryRecord = Readonly<{
  file: string;
  definition: RepositoryDefinition | null;
  issues: readonly PersistenceIssue[];
}>;

export type QueryPlanEvidence = Readonly<{
  file: string;
  id: string;
  repositoryId: string;
  queryId: string;
  database: string;
  capturedAt: string;
  planHash: string;
  indexes: readonly string[];
  maximumRows: number | null;
}>;

export type PersistenceInventory = Readonly<{
  root: string;
  schema: PrismaSchemaInventory | null;
  migrations: readonly MigrationRecord[];
  repositories: readonly RepositoryRecord[];
  queryPlans: readonly QueryPlanEvidence[];
  issues: readonly PersistenceIssue[];
  fingerprint: string;
}>;
