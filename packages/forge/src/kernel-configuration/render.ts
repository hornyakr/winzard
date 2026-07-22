import type {
  ArtifactComparison,
  ArtifactManifest,
  KernelConfigurationDiff,
  KernelConfigurationInventory,
  KernelConfigurationIssue,
  KernelConfigurationRecord,
} from './types';

function yesNo(value: boolean): string { return value ? 'yes' : 'no'; }

export function renderKernelConfigurationList(inventory: KernelConfigurationInventory): string {
  const lines = [
    `Kernel configuration (${inventory.profile})`,
    `Fingerprint: ${inventory.fingerprint}`,
    'ID  LIFECYCLE  STATUS  VALUE  REBUILD  RESTART',
    ...inventory.records.map((record) => [
      record.id,
      record.lifecycle,
      record.status,
      record.value,
      yesNo(record.rebuildRequired),
      yesNo(record.restartRequired),
    ].join('  ')),
  ];
  return lines.join('\n');
}

export function renderKernelConfigurationInspection(
  records: readonly KernelConfigurationRecord[],
): string {
  if (records.length === 0) return 'No kernel configuration record matched.';
  return records.map((record) => [
    `ID:               ${record.id}`,
    `Owner:            ${record.owner}`,
    `Lifecycle:        ${record.lifecycle}`,
    `Source:           ${record.source}`,
    `Status:           ${record.status}`,
    `Value:            ${record.value}`,
    `Sensitive:        ${yesNo(record.sensitive)}`,
    `Rebuild required: ${yesNo(record.rebuildRequired)}`,
    `Restart required: ${yesNo(record.restartRequired)}`,
  ].join('\n')).join('\n\n');
}

export function renderKernelConfigurationIssues(
  issues: readonly KernelConfigurationIssue[],
  label: string,
): string {
  if (issues.length === 0) return `PASS: ${label}`;
  return issues.map((issue) =>
    `${issue.severity === 'error' ? 'ERROR' : 'WARN'} [${issue.code}] ${issue.file}: ${issue.message}`,
  ).join('\n');
}

export function renderKernelConfigurationDiff(diff: KernelConfigurationDiff): string {
  const changed = diff.records.filter(({ changed }) => changed);
  if (changed.length === 0) return `PASS: kernel-config:diff ${diff.from} -> ${diff.to} (no change)`;
  return [
    `Kernel configuration diff: ${diff.from} -> ${diff.to}`,
    'ID  OWNER  FROM  TO',
    ...changed.map((record) =>
      `${record.id}  ${record.owner}  ${record.fromStatus}:${record.fromValue}  ${record.toStatus}:${record.toValue}`),
  ].join('\n');
}

export function renderArtifactManifest(manifest: ArtifactManifest): string {
  return [
    `Artifact: ${manifest.artifact}`,
    `Files: ${manifest.files.length}`,
    `SHA-256: ${manifest.sha256}`,
    'PATH  BYTES  SHA-256',
    ...manifest.files.map((file) => `${file.path}  ${file.bytes}  ${file.sha256}`),
  ].join('\n');
}

export function renderArtifactComparison(comparison: ArtifactComparison): string {
  if (comparison.equal) return 'PASS: build:reproducibility (artifacts are byte-identical)';
  return [
    'FAIL: build:reproducibility',
    ...comparison.added.map((file) => `ADDED ${file}`),
    ...comparison.removed.map((file) => `REMOVED ${file}`),
    ...comparison.changed.map((file) => `CHANGED ${file}`),
  ].join('\n');
}
