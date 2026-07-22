import type { PersistenceInventory, PersistenceIssue, PrismaModelRecord, RepositoryRecord } from './types';

export function renderPersistenceIssues(issues: readonly PersistenceIssue[], label: string): string {
  if (issues.length === 0) return `PASS: ${label}`;
  return [
    ...issues.map(({ code, severity, file, message }) => `[${severity.toUpperCase()}] ${code} ${file}: ${message}`),
    '',
    `${issues.filter(({ severity }) => severity === 'error').length} error, ${issues.filter(({ severity }) => severity === 'warning').length} warning`,
  ].join('\n');
}

export function renderDatabaseAbout(inventory: PersistenceInventory): string {
  return [
    `provider: ${inventory.schema?.provider ?? 'missing'}`,
    `schema fingerprint: ${inventory.schema?.fingerprint ?? 'missing'}`,
    `models: ${inventory.schema?.models.length ?? 0}`,
    `enums: ${inventory.schema?.enums.length ?? 0}`,
    `migrations: ${inventory.migrations.length}`,
    `repositories: ${inventory.repositories.length}`,
    `query plans: ${inventory.queryPlans.length}`,
    `inventory fingerprint: ${inventory.fingerprint}`,
  ].join('\n');
}

export function renderModel(model: PrismaModelRecord): string {
  return [
    `${model.name}${model.mappedName ? ` → ${model.mappedName}` : ''}`,
    ...model.fields.map((field) => `  ${field.name}: ${field.type}${field.list ? '[]' : field.optional ? '?' : ''}${field.id ? ' @id' : ''}${field.unique ? ' @unique' : ''}${field.relation ? ' @relation' : ''}${field.nativeType ? ` @db.${field.nativeType}` : ''}`),
    `  ids: ${model.ids.join(', ') || '-'}`,
    `  unique: ${model.uniqueConstraints.map((value) => `[${value.join(', ')}]`).join(', ') || '-'}`,
    `  indexes: ${model.indexes.map((value) => `[${value.join(', ')}]`).join(', ') || '-'}`,
  ].join('\n');
}

export function renderRepository(record: RepositoryRecord): string {
  const definition = record.definition;
  if (!definition) return `${record.file}: invalid definition`;
  return [
    `${definition.id} (${definition.role})`,
    `  port: ${definition.port}`,
    `  adapter: ${definition.adapter}`,
    `  models: ${definition.models.join(', ') || '-'}`,
    `  tenant scoped: ${definition.tenantScoped}`,
    `  soft delete: ${definition.softDelete}`,
    `  optimistic concurrency: ${definition.optimisticConcurrency}`,
    `  transaction: ${definition.transaction}`,
    ...definition.queries.map((query) => `  query ${query.id}: bounded=${query.bounded}, tenant=${query.tenantScoped}, order=${query.stableOrder.join(',') || '-'}`),
  ].join('\n');
}
