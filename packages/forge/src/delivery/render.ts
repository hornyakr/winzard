import type { DeliveryInventory, DeliveryIssue, DeliveryRecord } from './types';

function format(values: readonly string[]): string {
  return values.length === 0 ? '-' : values.join(', ');
}

function methods(record: DeliveryRecord): string {
  return record.methods.length === 0 ? '-' : record.methods.join(',');
}

export function renderDeliveryList(inventory: DeliveryInventory): string {
  const rows = inventory.records.map((record) => ({
    kind: record.kind,
    method: methods(record),
    route: record.route ?? format(record.exportedActions),
    entrypoint: record.entrypoint,
  }));
  const widths = {
    kind: Math.max('KIND'.length, ...rows.map(({ kind }) => kind.length)),
    method: Math.max('METHOD'.length, ...rows.map(({ method }) => method.length)),
    route: Math.max('ROUTE/ACTION'.length, ...rows.map(({ route }) => route.length)),
  };
  return [
    `${'KIND'.padEnd(widths.kind)}  ${'METHOD'.padEnd(widths.method)}  ${'ROUTE/ACTION'.padEnd(widths.route)}  ENTRYPOINT`,
    ...rows.map((row) => `${row.kind.padEnd(widths.kind)}  ${row.method.padEnd(widths.method)}  ${row.route.padEnd(widths.route)}  ${row.entrypoint}`),
  ].join('\n');
}

export function renderDeliveryInspection(records: readonly DeliveryRecord[]): string {
  if (records.length === 0) return 'No delivery entrypoint found.';
  return records.map((record) => [
    `Kind:                   ${record.kind}`,
    `Entrypoint:             ${record.entrypoint}`,
    `Route:                  ${record.route ?? '-'}`,
    `Methods:                ${methods(record)}`,
    `Runtime:                ${record.runtime}`,
    `Contract:               ${record.contractId ?? '-'}`,
    `Contract file:          ${record.contractFile ?? '-'}`,
    `Request context:        ${record.requestContext ?? '-'}`,
    `Authentication:         ${record.authentication ?? '-'}`,
    `Tenant:                 ${record.tenant ?? '-'}`,
    `Authorization policy:   ${record.authorizationPolicy ?? '-'}`,
    `Response policy:        ${record.responsePolicy ?? '-'}`,
    `CSRF:                   ${record.csrf ?? '-'}`,
    `Idempotency:            ${record.idempotency ?? '-'}`,
    `Body limit:             ${record.bodyLimitBytes ?? '-'}`,
    `Server actions:         ${format(record.exportedActions)}`,
    `Input schemas:          ${format(record.inputSchemas)}`,
    `Actor resolvers:        ${format(record.actorResolvers)}`,
    `Authorization:          ${format(record.authorizationCalls)}`,
    `Application operations: ${format(record.applicationOperations)}`,
    `Presenter:              ${record.presenter ?? '-'}`,
    `Output:                 ${format(record.outputKinds)}`,
    `Cache policy:           ${record.cachePolicy ?? '-'}`,
    `Streaming:              ${record.streaming ? 'yes' : 'no'}`,
    `Tests:                  ${format(record.tests)}`,
  ].join('\n')).join('\n\n');
}

export function renderDeliveryIssues(
  issues: readonly DeliveryIssue[],
  passLabel = 'delivery:check',
): string {
  if (issues.length === 0) return `PASS: ${passLabel}`;
  return issues.map((issue) =>
    `${issue.severity === 'error' ? 'ERROR' : 'WARN'} [${issue.code}] ${issue.file}: ${issue.message}`,
  ).join('\n');
}
