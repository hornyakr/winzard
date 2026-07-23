import type { FormInventory, FormIssue, FormRecord } from './types';

function valueList(values: readonly string[]): string {
  return values.length === 0 ? '-' : values.join(', ');
}

export function renderFormList(inventory: FormInventory): string {
  if (inventory.records.length === 0) return 'No form contracts.';
  return inventory.records.map((record) => [
    record.id,
    `execution=${record.execution}`,
    `component=${record.component}`,
    `fields=${record.fields.length}`,
    `delivery=${record.deliveryContractId ?? '-'}`,
  ].join(' ')).join('\n');
}

export function renderFormInspection(records: readonly FormRecord[]): string {
  if (records.length === 0) return 'No matching form contract.';
  return records.map((record) => [
    record.id,
    `file: ${record.file}`,
    `execution: ${record.execution}`,
    `mutation: ${record.mutation}`,
    `component: ${record.component}`,
    `delivery contract: ${record.deliveryContractId ?? '-'}`,
    `extractor: ${record.extractor}`,
    `schema: ${record.schema}`,
    `action state: ${record.actionState}`,
    `error mapper: ${record.errorMapper}`,
    `unknown fields: ${record.unknownFields}`,
    `progressive enhancement: ${record.progressiveEnhancement}`,
    `authentication: ${record.authentication ?? '-'}`,
    `tenant: ${record.tenant ?? '-'}`,
    `idempotency: ${record.idempotency ?? '-'}`,
    `fields: ${valueList(record.fields.map(({ name, kind, multiplicity }) => `${name}:${kind}:${multiplicity}`))}`,
    `intents: ${valueList(record.intents.map(({ value }) => value))}`,
    `source files: ${valueList(record.sourceFiles)}`,
    `tests: ${valueList(record.tests)}`,
  ].join('\n')).join('\n\n');
}

export function renderFormFields(inventory: FormInventory): string {
  const rows = inventory.records.flatMap((record) => record.fields.map((field) =>
    `${record.id} ${field.name} id=${field.id} kind=${field.kind} multiplicity=${field.multiplicity} required=${field.required} presentationOnly=${field.presentationOnly}`));
  return rows.join('\n') || 'No form fields.';
}

export function renderFormErrors(inventory: FormInventory): string {
  const rows = inventory.records.flatMap((record) => record.fields.flatMap((field) =>
    field.errorCodes.map((code) => `${record.id} ${field.name} ${code}`)));
  return rows.join('\n') || 'No declared form errors.';
}

export function renderFormIssues(issues: readonly FormIssue[], label = 'form:check'): string {
  if (issues.length === 0) return `PASS: ${label}`;
  return [
    ...issues.map((entry) => `[${entry.severity.toUpperCase()}] [${entry.code}] ${entry.file}: ${entry.message}`),
    `${issues.some(({ severity }) => severity === 'error') ? 'FAIL' : 'WARN'}: ${label} (${issues.length} issue)`,
  ].join('\n');
}
