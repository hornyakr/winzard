import { isContractJsonObject, type ContractJsonLiteral, type ContractJsonObject } from './ast';
import {
  CONTRACT_CANCELLATION,
  CONTRACT_CATEGORIES,
  CONTRACT_CLASSIFICATIONS,
  CONTRACT_CONCURRENCY,
  CONTRACT_IDEMPOTENCY,
  CONTRACT_PROVIDER_KINDS,
  CONTRACT_RUNTIMES,
  CONTRACT_RUNTIME_VALIDATION,
  CONTRACT_STABILITIES,
  CONTRACT_TENANT_SCOPES,
  CONTRACT_TIMEOUTS,
  CONTRACT_VISIBILITIES,
  type ContractDefinitionRecord,
  type ContractDeprecation,
  type ContractIssue,
  type ContractProviderRecord,
} from './types';

export const DEFINITION_FIELDS = new Set(['schemaVersion', 'id', 'contracts']);
export const PROVIDER_DEFINITION_FIELDS = new Set(['schemaVersion', 'id', 'providers']);
const CONTRACT_FIELDS = new Set([
  'id', 'owner', 'version', 'stability', 'visibility', 'categories', 'source', 'export',
  'documentation', 'runtimeValidation', 'runtimeSchema', 'errorCodes', 'cancellation',
  'timeout', 'concurrency', 'idempotency', 'securityClassification', 'tenantScope',
  'referenceSuite', 'deprecation',
]);
const PROVIDER_FIELDS = new Set([
  'id', 'contract', 'contractMajor', 'version', 'kind', 'source', 'export', 'runtime',
  'capabilities', 'referenceSuite', 'compositionServiceId',
]);
const DEPRECATION_FIELDS = new Set(['since', 'removal', 'replacement', 'migration']);

export function text(value: ContractJsonLiteral | undefined): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function integer(value: ContractJsonLiteral | undefined): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

function strings(value: ContractJsonLiteral | undefined): readonly string[] {
  return Array.isArray(value)
    ? Object.freeze(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))
    : Object.freeze([]);
}

function enumValue<T extends string>(value: ContractJsonLiteral | undefined, allowed: readonly T[]): T | null {
  return typeof value === 'string' && allowed.includes(value as T) ? value as T : null;
}

export function addIssue(issues: ContractIssue[], value: ContractIssue): void {
  issues.push(Object.freeze(value));
}

export function unknownFields(
  value: ContractJsonObject,
  allowed: ReadonlySet<string>,
  file: string,
  issues: ContractIssue[],
  code = 'CONTRACT_UNKNOWN_FIELD',
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) addIssue(issues, { severity: 'error', area: 'contract', code, file, message: `Ismeretlen contract definition mező: ${key}.` });
  }
}

function semverMajor(version: string): number | null {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.exec(version);
  return match ? Number(match[1]) : null;
}

function validVersionMarker(value: string): boolean {
  return semverMajor(value) !== null || /^\d+$/u.test(value);
}

function deprecationRecord(value: ContractJsonLiteral | undefined, file: string, issues: ContractIssue[], contractId: string): ContractDeprecation | null {
  if (value === null || value === undefined) return null;
  if (!isContractJsonObject(value)) {
    addIssue(issues, { severity: 'error', area: 'deprecation', code: 'CONTRACT_DEPRECATION_INVALID', file, contractId, message: 'A deprecation mező objektum vagy null legyen.' });
    return null;
  }
  unknownFields(value, DEPRECATION_FIELDS, file, issues, 'CONTRACT_DEPRECATION_UNKNOWN_FIELD');
  const since = text(value.since);
  const removal = text(value.removal);
  if (!since || !removal || !validVersionMarker(since) || !validVersionMarker(removal)) {
    addIssue(issues, { severity: 'error', area: 'deprecation', code: 'CONTRACT_DEPRECATION_INVALID', file, contractId, message: 'A deprecation since és removal mezői verziót jelöljenek.' });
    return null;
  }
  return Object.freeze({ since, removal, replacement: text(value.replacement), migration: text(value.migration) });
}

export function parseContract(value: ContractJsonObject, definitionId: string, definitionFile: string, issues: ContractIssue[]): ContractDefinitionRecord | null {
  unknownFields(value, CONTRACT_FIELDS, definitionFile, issues);
  const id = text(value.id);
  const owner = text(value.owner);
  const version = text(value.version);
  const major = version ? semverMajor(version) : null;
  const stability = enumValue(value.stability, CONTRACT_STABILITIES);
  const visibility = enumValue(value.visibility, CONTRACT_VISIBILITIES);
  const rawCategories = strings(value.categories);
  const categories = rawCategories.filter((item): item is ContractDefinitionRecord['categories'][number] => CONTRACT_CATEGORIES.includes(item as never));
  const source = text(value.source);
  const exportName = text(value.export);
  const documentation = text(value.documentation);
  const runtimeValidation = enumValue(value.runtimeValidation, CONTRACT_RUNTIME_VALIDATION);
  const runtimeSchema = text(value.runtimeSchema);
  const cancellation = enumValue(value.cancellation, CONTRACT_CANCELLATION);
  const timeout = enumValue(value.timeout, CONTRACT_TIMEOUTS);
  const concurrency = enumValue(value.concurrency, CONTRACT_CONCURRENCY);
  const idempotency = enumValue(value.idempotency, CONTRACT_IDEMPOTENCY);
  const securityClassification = enumValue(value.securityClassification, CONTRACT_CLASSIFICATIONS);
  const tenantScope = enumValue(value.tenantScope, CONTRACT_TENANT_SCOPES);
  const referenceSuite = text(value.referenceSuite);
  if (!id || !owner || !version || major === null || !stability || !visibility || categories.length === 0 || !source || !exportName || !documentation || !runtimeValidation || !cancellation || !timeout || !concurrency || !idempotency || !securityClassification || !tenantScope) {
    addIssue(issues, { severity: 'error', area: 'contract', code: 'CONTRACT_DEFINITION_INVALID', file: definitionFile, contractId: id ?? undefined, message: 'A contract kötelező azonosító-, ownership-, verzió-, lifecycle-, source- és viselkedési mezői hiányoznak vagy érvénytelenek.' });
    return null;
  }
  if (categories.length !== rawCategories.length) addIssue(issues, { severity: 'error', area: 'contract', code: 'CONTRACT_CATEGORY_UNKNOWN', file: definitionFile, contractId: id, message: 'A categories mező ismeretlen contractkategóriát tartalmaz.' });
  if (runtimeValidation === 'schema' && runtimeSchema === null) addIssue(issues, { severity: 'error', area: 'contract', code: 'CONTRACT_RUNTIME_VALIDATION_MISSING', file: definitionFile, contractId: id, message: 'A schema runtime validationhöz runtimeSchema szükséges.' });
  if (runtimeValidation === 'not-applicable' && runtimeSchema !== null) addIssue(issues, { severity: 'warning', area: 'contract', code: 'CONTRACT_RUNTIME_SCHEMA_ORPHAN', file: definitionFile, contractId: id, message: 'A runtimeSchema csak schema runtimeValidation mellett használható.' });
  const deprecation = deprecationRecord(value.deprecation, definitionFile, issues, id);
  if (stability === 'deprecated' && deprecation === null) addIssue(issues, { severity: 'error', area: 'deprecation', code: 'CONTRACT_DEPRECATION_MIGRATION_MISSING', file: definitionFile, contractId: id, message: 'Deprecated contracthoz replacement/removal migrációs metadata szükséges.' });
  return Object.freeze({ definitionId, definitionFile, id, owner, version, major, stability, visibility, categories: Object.freeze(categories), source, exportName, documentation, runtimeValidation, runtimeSchema, errorCodes: strings(value.errorCodes), cancellation, timeout, concurrency, idempotency, securityClassification, tenantScope, referenceSuite, deprecation });
}

export function parseProvider(value: ContractJsonObject, definitionId: string, definitionFile: string, issues: ContractIssue[]): ContractProviderRecord | null {
  unknownFields(value, PROVIDER_FIELDS, definitionFile, issues, 'CONTRACT_PROVIDER_UNKNOWN_FIELD');
  const id = text(value.id);
  const contractId = text(value.contract);
  const contractMajor = integer(value.contractMajor);
  const version = text(value.version);
  const kind = enumValue(value.kind, CONTRACT_PROVIDER_KINDS);
  const source = text(value.source);
  const exportName = text(value.export);
  const runtime = enumValue(value.runtime, CONTRACT_RUNTIMES);
  const capabilities = strings(value.capabilities);
  const referenceSuite = text(value.referenceSuite);
  const compositionServiceId = text(value.compositionServiceId);
  if (!id || !contractId || contractMajor === null || contractMajor < 0 || !version || semverMajor(version) === null || !kind || !source || !exportName || !runtime || capabilities.length === 0) {
    addIssue(issues, { severity: 'error', area: 'provider', code: 'CONTRACT_PROVIDER_INVALID', file: definitionFile, providerId: id ?? undefined, message: 'A provider kötelező contract-, verzió-, runtime-, capability- és source-mezői hiányoznak vagy érvénytelenek.' });
    return null;
  }
  return Object.freeze({ definitionId, definitionFile, id, contractId, contractMajor, version, kind, source, exportName, runtime, capabilities, referenceSuite, compositionServiceId });
}
