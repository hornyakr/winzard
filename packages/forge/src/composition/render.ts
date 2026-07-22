import type {
  CompositionInventory,
  CompositionIssue,
  CompositionServiceRecord,
} from './types';

function cell(value: string | number | boolean | null | readonly string[]): string {
  if (value === null || value === '') return '-';
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : '-';
  return String(value);
}

export function renderCompositionIssues(
  issues: readonly CompositionIssue[],
  label: string,
): string {
  if (issues.length === 0) return `PASS: ${label}`;
  return [
    ...issues.map((item) => `${item.severity === 'warning' ? 'WARN' : 'ERROR'} [${item.code}] ${item.file}: ${item.message}`),
    `${issues.some(({ severity }) => severity === 'error') ? 'FAIL' : 'PASS'}: ${label} (${issues.length} issue)`,
  ].join('\n');
}

export function renderCompositionList(inventory: CompositionInventory): string {
  const rows = inventory.services.map((service) => [
    service.id,
    service.port ?? '-',
    service.implementation,
    service.lifetime,
    service.runtime,
    service.visibility,
    service.dependencies.join(', ') || '-',
  ].join(' | '));
  return [
    'SERVICE | PORT | IMPLEMENTATION | LIFETIME | RUNTIME | VISIBILITY | DEPENDENCIES',
    ...rows,
    `Fingerprint: ${inventory.fingerprint}`,
  ].join('\n');
}

export function renderCompositionInspection(records: readonly CompositionServiceRecord[]): string {
  if (records.length === 0) return 'No matching composition service.';
  return records.map((service) => [
    `Service: ${service.id}`,
    `Implementation: ${service.implementation}`,
    `Port: ${cell(service.port)}`,
    `Source: ${service.source}${service.exportName ? `#${service.exportName}` : ''}`,
    `Lifetime: ${service.lifetime}`,
    `Runtime: ${service.runtime}`,
    `Visibility: ${service.visibility}`,
    `Dependencies: ${cell(service.dependencies)}`,
    `Decorators: ${cell(service.decorators)}`,
    `Aliases: ${cell(service.aliases)}`,
    `Tags: ${cell(service.tags)}`,
    `Config keys: ${cell(service.configKeys)}`,
    `Secret keys: ${cell(service.secretKeys)}`,
  ].join('\n')).join('\n\n');
}

function mermaidId(value: string): string {
  return value.replace(/[^A-Za-z0-9_]/gu, '_');
}

export function renderCompositionGraph(
  inventory: CompositionInventory,
  format: 'text' | 'mermaid' = 'text',
): string {
  if (format === 'mermaid') {
    const lines = ['graph TD'];
    for (const root of inventory.roots) {
      for (const service of root.services) {
        lines.push(`  ${mermaidId(root.id)}[${JSON.stringify(root.id)}] --> ${mermaidId(service)}[${JSON.stringify(service)}]`);
      }
    }
    for (const service of inventory.services) {
      for (const dependency of service.dependencies) {
        lines.push(`  ${mermaidId(service.id)} --> ${mermaidId(dependency)}`);
      }
    }
    return lines.join('\n');
  }
  return [
    ...inventory.roots.flatMap((root) => root.services.map((service) => `${root.id} → ${service}`)),
    ...inventory.services.flatMap((service) => service.dependencies.map((dependency) => `${service.id} → ${dependency}`)),
  ].join('\n');
}

export function renderCompositionAliases(inventory: CompositionInventory): string {
  const rows = inventory.services.flatMap((service) =>
    service.aliases.map((alias) => `${alias} → ${service.id}`));
  return rows.length > 0 ? rows.join('\n') : 'No composition aliases.';
}

export function renderCompositionLifetimes(inventory: CompositionInventory): string {
  return inventory.services.map((service) =>
    `${service.lifetime.padEnd(9)} ${service.id}`).join('\n');
}
