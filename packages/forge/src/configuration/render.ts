import type {
  ConfigurationDiffRecord,
  ConfigurationInventory,
  ConfigurationIssue,
  ConfigurationRecord,
} from './types';

function yesNo(value: boolean): string {
  return value ? 'yes' : 'no';
}

export function renderConfigurationList(inventory: ConfigurationInventory): string {
  const rows = inventory.records.map((record) => ({
    key: record.definition.key,
    owner: record.definition.owner,
    required: yesNo(record.definition.required),
    phase: record.definition.phase,
    classification: record.definition.classification,
    source: record.source.label,
    status: record.status,
    rebuild: yesNo(record.definition.rebuildRequired),
    restart: yesNo(record.definition.restartRequired),
  }));
  const fields = ['key', 'owner', 'required', 'phase', 'classification', 'source', 'status', 'rebuild'] as const;
  const labels = {
    key: 'KEY', owner: 'OWNER', required: 'REQUIRED', phase: 'PHASE',
    classification: 'CLASS', source: 'SOURCE', status: 'STATUS', rebuild: 'REBUILD',
  } as const;
  const widths = Object.fromEntries(fields.map((field) => [
    field,
    Math.max(labels[field].length, ...rows.map((row) => row[field].length)),
  ])) as Record<(typeof fields)[number], number>;
  return [
    `${labels.key.padEnd(widths.key)}  ${labels.owner.padEnd(widths.owner)}  ${labels.required.padEnd(widths.required)}  ${labels.phase.padEnd(widths.phase)}  ${labels.classification.padEnd(widths.classification)}  ${labels.source.padEnd(widths.source)}  ${labels.status.padEnd(widths.status)}  ${labels.rebuild.padEnd(widths.rebuild)}  RESTART`,
    ...rows.map((row) => `${row.key.padEnd(widths.key)}  ${row.owner.padEnd(widths.owner)}  ${row.required.padEnd(widths.required)}  ${row.phase.padEnd(widths.phase)}  ${row.classification.padEnd(widths.classification)}  ${row.source.padEnd(widths.source)}  ${row.status.padEnd(widths.status)}  ${row.rebuild.padEnd(widths.rebuild)}  ${row.restart}`),
  ].join('\n');
}

export function renderConfigurationInspection(record: ConfigurationRecord): string {
  const validation = JSON.stringify(record.definition.validation);
  return [
    `Key:             ${record.definition.key}`,
    `Owner:           ${record.definition.owner}`,
    `Capability:      ${record.definition.capability}`,
    `Description:     ${record.definition.description}`,
    `Required:        ${yesNo(record.definition.required)}`,
    `Phase:           ${record.definition.phase}`,
    `Classification:  ${record.definition.classification}`,
    `Rebuild:         ${yesNo(record.definition.rebuildRequired)}`,
    `Restart:         ${yesNo(record.definition.restartRequired)}`,
    `Validation:      ${validation}`,
    `Safe example:    ${record.definition.example}`,
    `Status:          ${record.status}`,
    `Source:          ${record.source.label}`,
    `Present:         ${yesNo(record.present)}`,
    `Empty:           ${yesNo(record.empty)}`,
    `Length:          ${record.length ?? '-'}`,
    `Fingerprint:     ${record.fingerprint ?? '-'}`,
    `Consumers:       ${record.consumers.join(', ') || '-'}`,
  ].join('\n');
}

export function renderConfigurationIssues(
  issues: readonly ConfigurationIssue[],
  label = 'configuration',
): string {
  if (issues.length === 0) return `PASS: ${label}`;
  return issues.map((issue) =>
    `${issue.severity === 'error' ? 'ERROR' : 'WARN'} [${issue.code}] ${issue.file}${issue.key ? ` (${issue.key})` : ''}: ${issue.message}`,
  ).join('\n');
}

export function renderConfigurationDiff(
  records: readonly ConfigurationDiffRecord[],
  from: string,
  to: string,
): string {
  const changed = records.filter((record) => record.changed);
  if (changed.length === 0) return `PASS: config:diff ${from} -> ${to} (no redacted change)`;
  return [
    `Configuration diff: ${from} -> ${to}`,
    'KEY  OWNER  FROM  TO  FINGERPRINT_CHANGED',
    ...changed.map((record) => [
      record.key,
      record.owner,
      record.fromStatus,
      record.toStatus,
      record.fromFingerprint === record.toFingerprint ? 'no' : 'yes',
    ].join('  ')),
  ].join('\n');
}
