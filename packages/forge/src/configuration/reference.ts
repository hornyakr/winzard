import path from 'node:path';

import type { WinzardManifest } from '../manifest';
import {
  GENERATED_HEADER,
  contentMatches,
  sha256,
  writeTextFile,
} from '../documentation/generated';
import { configurationDefinitionsForManifest } from './catalog';
import { configurationValidationLabel } from './metadata';
import type { ConfigurationDefinition, ConfigurationIssue } from './types';

export const CONFIGURATION_REFERENCE_PATH =
  'docs/90-generated/configuration/configuration-reference.md';

function yesNo(value: boolean): string {
  return value ? 'yes' : 'no';
}

function escapeCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function optionalCell(value: string | undefined): string {
  return value === undefined ? '-' : escapeCell(value);
}

function defaultCell(definition: ConfigurationDefinition): string {
  return definition.defaultValue === undefined
    ? '-'
    : `\`${escapeCell(definition.defaultValue)}\``;
}

export function renderConfigurationReference(manifest: WinzardManifest): string {
  const definitions = configurationDefinitionsForManifest(manifest);
  const inventoryHash = sha256(JSON.stringify(definitions));
  const rows = definitions.map((definition) => [
    `\`${definition.key}\``,
    definition.owner,
    escapeCell(configurationValidationLabel(definition.validation)),
    yesNo(definition.required),
    definition.phase,
    definition.classification,
    yesNo(definition.rebuildRequired),
    yesNo(definition.restartRequired),
    defaultCell(definition),
    `\`${escapeCell(definition.example)}\``,
    escapeCell(definition.introduced),
    optionalCell(definition.deprecated),
    optionalCell(definition.removed),
    escapeCell(definition.description),
  ].join(' | '));

  return `${GENERATED_HEADER}
<!-- Source: Winzard capability manifest and configuration catalog. -->

# Configuration reference

Inventory SHA-256: \`${inventoryHash}\`

Profile: \`${manifest.profile}\`

| Key | Owner | Type / validation | Required | Phase | Classification | Rebuild | Restart | Default | Safe example | Introduced | Deprecated | Removed | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${rows.map((row) => `| ${row} |`).join('\n') || '| - | - | - | - | - | - | - | - | - | - | - | - | - | No active configuration keys. |'}
`;
}

export async function generateConfigurationReference(
  root: string,
  manifest: WinzardManifest,
): Promise<string> {
  const file = path.join(root, CONFIGURATION_REFERENCE_PATH);
  await writeTextFile(file, renderConfigurationReference(manifest));
  return CONFIGURATION_REFERENCE_PATH;
}

export async function checkConfigurationReference(
  root: string,
  manifest: WinzardManifest,
): Promise<readonly ConfigurationIssue[]> {
  const expected = renderConfigurationReference(manifest);
  if (await contentMatches(path.join(root, CONFIGURATION_REFERENCE_PATH), expected)) return [];
  return [{
    severity: 'error',
    code: 'CONFIG_REFERENCE_DRIFT',
    file: CONFIGURATION_REFERENCE_PATH,
    message: 'A generált konfigurációs reference hiányzik vagy eltér az aktív capability-contracttól.',
    remediation: 'Run pnpm forge config:reference --project <PROJECT>.',
  }];
}
