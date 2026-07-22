import { access } from 'node:fs/promises';
import path from 'node:path';

import {
  GENERATED_HEADER,
  contentMatches,
  writeTextFile,
} from '../documentation/generated';
import { loadExplicitEnvironmentFile } from '../configuration/environment';
import { buildKernelConfigurationInventory } from './inventory';
import type {
  KernelConfigurationInventory,
  KernelConfigurationIssue,
} from './types';


async function documentationSnapshot(root: string) {
  for (const file of ['.env.test', '.env.example']) {
    try {
      await access(path.join(root, file));
      return loadExplicitEnvironmentFile(root, file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return loadExplicitEnvironmentFile(root, '.env.test');
}

async function documentationInventory(root: string): Promise<KernelConfigurationInventory> {
  return buildKernelConfigurationInventory(root, {
    snapshot: await documentationSnapshot(root),
    runtimeMode: 'web',
  });
}

export const KERNEL_CONFIGURATION_DOCUMENTATION_PATHS = Object.freeze([
  'docs/90-generated/kernel-configuration/kernel-configuration.md',
  'docs/90-generated/kernel-configuration/security-status.md',
] as const);

function escapeCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

export function renderKernelConfigurationDocumentation(
  inventory: KernelConfigurationInventory,
): ReadonlyMap<string, string> {
  const rows = inventory.records.map((record) =>
    `| \`${record.id}\` | ${record.owner} | ${record.lifecycle} | ${record.source} | ${record.status} | ${escapeCell(record.value)} | ${record.rebuildRequired ? 'yes' : 'no'} | ${record.restartRequired ? 'yes' : 'no'} |`);
  const issueRows = inventory.issues.map((issue) =>
    `| ${issue.severity} | \`${issue.code}\` | ${issue.area} | \`${escapeCell(issue.file)}\` | ${escapeCell(issue.message)} |`);
  return new Map([
    [KERNEL_CONFIGURATION_DOCUMENTATION_PATHS[0], `${GENERATED_HEADER}
<!-- Source: Winzard manifest, kernel configuration catalog and static project inspection. -->

# Kernel configuration inventory

Fingerprint: \`${inventory.fingerprint}\`

Profile: \`${inventory.profile}\`

| ID | Owner | Lifecycle | Source | Status | Redacted value | Rebuild | Restart |
| --- | --- | --- | --- | --- | --- | --- | --- |
${rows.join('\n') || '| - | - | - | - | - | - | - | - |'}
`],
    [KERNEL_CONFIGURATION_DOCUMENTATION_PATHS[1], `${GENERATED_HEADER}
<!-- Source: kernel configuration schema, path, proxy, host, locale and static security checks. -->

# Kernel configuration security status

| Severity | Code | Area | File | Message |
| --- | --- | --- | --- | --- |
${issueRows.join('\n') || '| - | - | - | - | No kernel configuration issue detected. |'}
`],
  ]);
}

export async function generateKernelConfigurationDocumentation(
  root: string,
): Promise<readonly string[]> {
  const expected = renderKernelConfigurationDocumentation(
    await documentationInventory(root),
  );
  for (const [file, content] of expected) {
    await writeTextFile(path.join(root, file), content);
  }
  return [...expected.keys()];
}

export async function checkKernelConfigurationDocumentation(
  root: string,
): Promise<readonly KernelConfigurationIssue[]> {
  const expected = renderKernelConfigurationDocumentation(
    await documentationInventory(root),
  );
  const issues: KernelConfigurationIssue[] = [];
  for (const [file, content] of expected) {
    if (!await contentMatches(path.join(root, file), content)) {
      issues.push({
        severity: 'error',
        area: 'security',
        code: 'KERNEL_CONFIGURATION_DOCUMENTATION_DRIFT',
        file,
        message: 'A generált kernelkonfigurációs evidence hiányzik vagy elavult.',
        remediation: 'Run pnpm forge kernel-config:docs --project <PROJECT>.',
      });
    }
  }
  return issues;
}
