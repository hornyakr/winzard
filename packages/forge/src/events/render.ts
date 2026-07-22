import type { EventInventory, EventIssue, EventRecord } from './types';

export function renderEventIssues(issues: readonly EventIssue[], label: string): string {
  if (issues.length === 0) return `PASS: ${label}`;
  return [...issues.map((issue) => `[${issue.severity.toUpperCase()}:${issue.code}] ${issue.file}: ${issue.message}`), `FAIL: ${label} (${issues.filter(({ severity }) => severity === 'error').length} hiba)`].join('\n');
}
export function renderEventList(inventory: EventInventory): string {
  if (inventory.events.length === 0) return 'No event definitions.';
  return ['TYPE | CATEGORY | VERSION | CLASSIFICATION | HANDLERS', ...inventory.events.map((event) => `${event.type} | ${event.category} | v${event.version} | ${event.classification} | ${event.handlers.length}`), `Fingerprint: ${inventory.fingerprint}`].join('\n');
}
export function renderEventInspection(records: readonly EventRecord[]): string {
  if (records.length === 0) return 'No matching event.';
  return records.map((event) => [
    `Event: ${event.type}`,
    `ID: ${event.id}`,
    `Category: ${event.category}`,
    `Version: ${event.version}`,
    `Producer: ${event.producer}`,
    `Payload schema: ${event.payloadSchema ?? '-'}`,
    `Classification: ${event.classification}`,
    `Tenant scoped: ${event.tenantScoped ? 'yes' : 'no'}`,
    'Handlers:',
    ...event.handlers.map((handler) => `  - ${handler.id} [${handler.phase}; ${handler.failurePolicy}]`),
  ].join('\n')).join('\n\n');
}
export function renderEventGraph(inventory: EventInventory, format: 'text' | 'mermaid'): string {
  if (format === 'mermaid') return ['graph LR', ...inventory.events.flatMap((event) => [`  ${safe(event.producer)}["${event.producer}"] --> ${safe(event.type)}["${event.type}"]`, ...event.handlers.map((handler) => `  ${safe(event.type)} --> ${safe(handler.id)}["${handler.id}"]`)])].join('\n');
  return inventory.events.flatMap((event) => [`${event.producer} → ${event.type}`, ...event.handlers.map((handler) => `  → ${handler.id} [${handler.phase}]`)]).join('\n');
}
function safe(value: string): string { return value.replace(/[^A-Za-z0-9_]/gu, '_'); }
