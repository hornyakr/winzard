import type { KernelInventory, KernelIssue, KernelRecord } from './types';

function scalar(input: string | number | null | undefined): string {
  if (input === null || input === undefined || input === '') return '-';
  return String(input);
}

function list(input: readonly string[]): string {
  return input.length > 0 ? input.join(', ') : '-';
}

function map(input: Readonly<Record<string, string>>): string {
  const entries = Object.entries(input).filter(([, value]) => value !== '');
  return entries.length > 0
    ? entries.map(([key, value]) => `${key}: ${value}`).join(', ')
    : '-';
}

function routeOrActions(record: KernelRecord): string {
  return record.route ?? list(record.actions);
}

export function renderKernelGraph(inventory: KernelInventory): string {
  if (inventory.records.length === 0) return 'No kernel contract found.';
  return inventory.records.map((record) => [
    routeOrActions(record),
    `  -> contract ${record.id}`,
    `  -> request-context ${record.requestContext}`,
    `  -> operation ${map(record.operations)}`,
    `  -> presenter ${map(record.presenters)}`,
    `  -> response-policy ${record.responsePolicy ?? scalar(record.cache)}`,
    `  -> instrumentation ${list(record.instrumentation)}`,
    `  -> tests ${list(record.tests)}`,
  ].join('\n')).join('\n\n');
}

export function renderKernelInspection(records: readonly KernelRecord[]): string {
  if (records.length === 0) return 'No kernel contract found.';
  return records.map((record) => [
    `ID:                ${record.id}`,
    `Kind:              ${record.kind}`,
    `Contract:          ${record.contractFile}`,
    `Contract export:   ${record.contractExport}`,
    `Entrypoint:        ${record.entrypoint ?? '-'}`,
    `Route/actions:     ${routeOrActions(record)}`,
    `Methods:           ${list(record.methods)}`,
    `Runtime:           ${record.runtime}`,
    `Request context:   ${record.requestContext}`,
    `Context factories: ${list(record.requestContextFactories)}`,
    `Authentication:    ${record.authentication}`,
    `Tenant:            ${record.tenant}`,
    `Authorization:     ${map(record.authorization)}`,
    `Rate limit:        ${scalar(record.rateLimit)}`,
    `Cache:             ${scalar(record.cache)}`,
    `Response policy:   ${scalar(record.responsePolicy)}`,
    `CSRF:              ${scalar(record.csrf)}`,
    `Idempotency:       ${scalar(record.idempotency)}`,
    `Body limit:        ${scalar(record.bodyLimitBytes)}`,
    `Streaming:         ${record.streaming ? 'yes' : 'no'}`,
    `Operations:        ${map(record.operations)}`,
    `Presenters:        ${map(record.presenters)}`,
    `Response schemas:  ${map(record.responseSchemas)}`,
    `Errors:            ${list(record.errors)}`,
    `Revalidation:      ${list(record.revalidation)}`,
    `Enforcement:       ${list(record.enforcement)}`,
    `After hooks:       ${list(record.afterHooks)}`,
    `Error mappers:     ${list(record.errorMappers)}`,
    `Instrumentation:   ${list(record.instrumentation)}`,
    `Tests:             ${list(record.tests)}`,
  ].join('\n')).join('\n\n');
}

export function renderKernelIssues(
  issues: readonly KernelIssue[],
  passLabel = 'kernel:check',
): string {
  if (issues.length === 0) return `PASS: ${passLabel}`;
  return issues.map((item) =>
    `${item.severity === 'error' ? 'ERROR' : 'WARN'} [${item.code}] ${item.file}: ${item.message}`,
  ).join('\n');
}
