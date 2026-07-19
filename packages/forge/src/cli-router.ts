#!/usr/bin/env node
import path from 'node:path';

import { runProjectChecks } from './checks/project';
import { diffConfiguration } from './configuration/diff';
import { checkConfigurationDrift, findUnusedConfiguration } from './configuration/drift';
import { buildConfigurationInventory, redactConfigurationRecord } from './configuration/inventory';
import { checkConfigurationReference, generateConfigurationReference } from './configuration/reference';
import { renderConfigurationDiff, renderConfigurationInspection, renderConfigurationIssues, renderConfigurationList } from './configuration/render';
import { scanRepositorySecrets } from './configuration/secrets';
import { checkDeliveryDocumentation, generateDeliveryDocumentation } from './delivery/docs';
import { generateDeliverySlice } from './delivery/generator';
import { buildDeliveryInventory, inspectDelivery } from './delivery/inventory';
import { renderDeliveryInspection, renderDeliveryIssues, renderDeliveryList } from './delivery/render';
import type { DeliveryGenerationKind } from './delivery/types';
import { loadProjectManifest } from './manifest';
import { checkViewDocumentation, generateViewDocumentation } from './views/docs';
import { generateView } from './views/generator';
import { buildViewInventory, inspectViews, isViewAssetIssue } from './views/inventory';
import { renderViewAssets, renderViewInspection, renderViewIssues, renderViewList } from './views/render';

const args = process.argv.slice(2);
const command = args[0] ?? 'list';
const OPTIONS_WITH_VALUES = new Set(['--project', '--node-env', '--from', '--to']);

function positionalArguments(values: readonly string[]): readonly string[] {
  const output: string[] = [];
  for (let index = 1; index < values.length; index += 1) {
    const value = values[index] ?? '';
    if (!value.startsWith('--')) {
      output.push(value);
      continue;
    }
    if (!value.includes('=') && OPTIONS_WITH_VALUES.has(value)) index += 1;
  }
  return output;
}
const positionals = positionalArguments(args);
const option = (name: string): string | null => {
  const inline = args.find((value) => value.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] && !args[index + 1]?.startsWith('--') ? args[index + 1] ?? null : null;
};
const flag = (name: string): boolean => args.includes(name);
const projectArgument = option('--project') ?? '.';
const root = path.resolve(process.cwd(), projectArgument);
const json = flag('--json');

async function deliveryCheck(label = 'delivery:check'): Promise<void> {
  const inventory = await buildDeliveryInventory(root);
  console.log(json ? JSON.stringify({ issues: inventory.issues }, null, 2) : renderDeliveryIssues(inventory.issues, label));
  if (inventory.issues.some(({ severity }) => severity === 'error')) process.exitCode = 1;
}

async function viewCheck(label = 'view:check'): Promise<void> {
  const inventory = await buildViewInventory(root);
  console.log(json ? JSON.stringify({ issues: inventory.issues }, null, 2) : renderViewIssues(inventory.issues, label));
  if (inventory.issues.some(({ severity }) => severity === 'error')) process.exitCode = 1;
}

async function projectCheck(includeSecrets = false): Promise<void> {
  const failures = [...await runProjectChecks(root)];
  const manifest = await loadProjectManifest(root);
  if (manifest.manifest?.capabilities.includes('next-app')) {
    failures.push(...(await buildDeliveryInventory(root)).issues.filter(({ severity }) => severity === 'error'));
  }
  if (includeSecrets) {
    failures.push(...(await scanRepositorySecrets(root))
      .filter(({ severity }) => severity === 'error')
      .map(({ code, file, message }) => ({ code, file, message })));
  }
  if (failures.length === 0) {
    console.log(`PASS: ${command} (${projectArgument})`);
    return;
  }
  for (const failure of failures) console.error(`[${failure.code}] ${failure.file}: ${failure.message}`);
  console.error(`FAIL: ${command} (${failures.length} hiba)`);
  process.exitCode = 1;
}

async function configurationManifest() {
  const result = await loadProjectManifest(root);
  if (result.manifest) return result.manifest;
  for (const failure of result.failures) console.error(`[${failure.code}] ${failure.file}: ${failure.message}`);
  process.exitCode = 1;
  return null;
}

function hasErrors(issues: readonly { severity: string }[]): boolean {
  return issues.some(({ severity }) => severity === 'error');
}

async function configurationCommand(): Promise<boolean> {
  if (!command.startsWith('config:') && command !== 'secrets:check') return false;

  if (command === 'secrets:check') {
    const issues = await scanRepositorySecrets(root);
    console.log(json ? JSON.stringify({ issues }, null, 2) : renderConfigurationIssues(issues, 'secrets:check'));
    if (hasErrors(issues)) process.exitCode = 1;
    return true;
  }

  const manifest = await configurationManifest();
  if (!manifest) return true;

  if (command === 'config:list') {
    const inventory = await buildConfigurationInventory(root, manifest, {
      ...(option('--node-env') ? { nodeEnv: option('--node-env') ?? undefined } : {}),
    });
    console.log(json
      ? JSON.stringify({
        nodeEnv: inventory.nodeEnv,
        loadedFiles: inventory.loadedFiles,
        records: inventory.records.map(redactConfigurationRecord),
        issues: inventory.issues,
      }, null, 2)
      : renderConfigurationList(inventory));
    if (hasErrors(inventory.issues)) process.exitCode = 1;
    return true;
  }

  if (command === 'config:inspect') {
    const key = positionals[0]?.trim().toUpperCase();
    if (!key) throw new Error('A config:inspect parancshoz konfigurációs kulcs szükséges.');
    const inventory = await buildConfigurationInventory(root, manifest, {
      ...(option('--node-env') ? { nodeEnv: option('--node-env') ?? undefined } : {}),
    });
    const record = inventory.records.find(({ definition }) => definition.key === key);
    if (!record) {
      console.error(`[CONFIG_KEY_UNKNOWN] ${key}`);
      process.exitCode = 1;
      return true;
    }
    const issues = inventory.issues.filter((issue) => issue.key === key);
    console.log(json
      ? JSON.stringify({ record: redactConfigurationRecord(record), issues }, null, 2)
      : [
        renderConfigurationInspection(record),
        ...(issues.length > 0 ? [`\n${renderConfigurationIssues(issues, 'config:inspect')}`] : []),
      ].join(''));
    if (!record.valid || hasErrors(issues)) process.exitCode = 1;
    return true;
  }

  if (command === 'config:reference') {
    if (flag('--check')) {
      const issues = await checkConfigurationReference(root, manifest);
      console.log(json ? JSON.stringify({ issues }, null, 2) : renderConfigurationIssues(issues, 'config:reference --check'));
      if (hasErrors(issues)) process.exitCode = 1;
    } else {
      const file = await generateConfigurationReference(root, manifest);
      console.log(json ? JSON.stringify({ files: [file] }, null, 2) : `GENERATED: ${file}`);
    }
    return true;
  }

  if (command === 'config:drift') {
    const issues = await checkConfigurationDrift(root, manifest);
    console.log(json ? JSON.stringify({ issues }, null, 2) : renderConfigurationIssues(issues, 'config:drift'));
    if (hasErrors(issues)) process.exitCode = 1;
    return true;
  }

  if (command === 'config:unused') {
    const issues = await findUnusedConfiguration(root, manifest);
    console.log(json ? JSON.stringify({ issues }, null, 2) : renderConfigurationIssues(issues, 'config:unused'));
    return true;
  }

  if (command === 'config:diff') {
    const from = option('--from');
    const to = option('--to');
    if (!from || !to) throw new Error('A config:diff parancshoz --from és --to szükséges.');
    const result = await diffConfiguration(root, manifest, from, to);
    console.log(json ? JSON.stringify(result, null, 2) : [
      renderConfigurationDiff(result.records, from, to),
      ...(result.issues.length > 0 ? [`\n${renderConfigurationIssues(result.issues, 'config:diff')}`] : []),
    ].join(''));
    if (hasErrors(result.issues)) process.exitCode = 1;
    return true;
  }

  if (command === 'config:doctor') {
    const inventory = await buildConfigurationInventory(root, manifest, {
      ...(option('--node-env') ? { nodeEnv: option('--node-env') ?? undefined } : {}),
    });
    const issues = [
      ...inventory.issues,
      ...(await checkConfigurationDrift(root, manifest)),
      ...(await findUnusedConfiguration(root, manifest)),
      ...(await checkConfigurationReference(root, manifest)),
      ...(await scanRepositorySecrets(root)),
    ];
    console.log(json ? JSON.stringify({
      records: inventory.records.map(redactConfigurationRecord),
      issues,
    }, null, 2) : [
      renderConfigurationList(inventory),
      '',
      renderConfigurationIssues(issues, 'config:doctor'),
    ].join('\n'));
    if (hasErrors(issues)) process.exitCode = 1;
    return true;
  }

  return false;
}

async function deliveryCommand(): Promise<boolean> {
  if (command === 'delivery:list') {
    const inventory = await buildDeliveryInventory(root);
    console.log(json ? JSON.stringify(inventory, null, 2) : renderDeliveryList(inventory));
    return true;
  }
  if (command === 'delivery:inspect') {
    const value = positionals[0];
    if (!value) throw new Error('A delivery:inspect parancshoz entrypoint vagy route szükséges.');
    const records = inspectDelivery(await buildDeliveryInventory(root), value);
    if (records.length === 0) process.exitCode = 1;
    console.log(json ? JSON.stringify({ records }, null, 2) : renderDeliveryInspection(records));
    return true;
  }
  if (command === 'delivery:check') {
    await deliveryCheck();
    return true;
  }
  if (command === 'http:contracts') {
    if (flag('--check')) {
      const issues = await checkDeliveryDocumentation(root);
      console.log(json ? JSON.stringify({ issues }, null, 2) : renderDeliveryIssues(issues, 'http:contracts --check'));
      if (issues.some(({ severity }) => severity === 'error')) process.exitCode = 1;
    } else {
      const files = await generateDeliveryDocumentation(root);
      console.log(json ? JSON.stringify({ files }, null, 2) : `GENERATED: ${files.length} delivery dokumentum`);
    }
    return true;
  }
  const generation = new Map<string, DeliveryGenerationKind>([
    ['make:page', 'page'],
    ['make:route-handler', 'route-handler'],
    ['make:action', 'action'],
    ['make:operation', 'operation'],
    ['make:vertical-slice', 'vertical-slice'],
  ]).get(command);
  if (generation) {
    const target = positionals[0];
    if (!target) throw new Error(`A ${command} parancshoz cél szükséges.`);
    const result = await generateDeliverySlice(generation, target, {
      root,
      dryRun: flag('--dry-run'),
      force: flag('--force'),
    });
    console.log(json ? JSON.stringify(result, null, 2) : [
      `${result.dryRun ? 'PLAN' : 'DONE'}: ${command} ${target}`,
      `Created: ${result.created.length}`,
      `Skipped: ${result.skipped.length}`,
      `Overwritten: ${result.overwritten.length}`,
      ...result.created.map((file) => `+ ${file}`),
    ].join('\n'));
    return true;
  }
  return false;
}

async function viewCommand(): Promise<boolean> {
  if (command === 'view:list') {
    const inventory = await buildViewInventory(root);
    console.log(json ? JSON.stringify(inventory, null, 2) : renderViewList(inventory));
    return true;
  }
  if (command === 'view:inspect') {
    const value = positionals[0];
    if (!value) throw new Error('A view:inspect parancshoz komponensnév, fájl vagy route szükséges.');
    const records = inspectViews(await buildViewInventory(root), value);
    if (records.length === 0) process.exitCode = 1;
    console.log(json ? JSON.stringify({ records }, null, 2) : renderViewInspection(records));
    return true;
  }
  if (command === 'view:check') {
    await viewCheck();
    return true;
  }
  if (command === 'view:contracts') {
    if (flag('--check')) {
      const issues = await checkViewDocumentation(root);
      console.log(json ? JSON.stringify({ issues }, null, 2) : renderViewIssues(issues, 'view:contracts --check'));
      if (issues.some(({ severity }) => severity === 'error')) process.exitCode = 1;
    } else {
      const files = await generateViewDocumentation(root);
      console.log(json ? JSON.stringify({ files }, null, 2) : `GENERATED: ${files.length} view dokumentum`);
    }
    return true;
  }
  if (command === 'view:assets') {
    const inventory = await buildViewInventory(root);
    const issues = inventory.issues.filter(isViewAssetIssue);
    if (json) {
      console.log(JSON.stringify({ records: inventory.records, issues }, null, 2));
    } else {
      console.log(renderViewAssets(inventory));
      if (issues.length > 0) console.log(`\n${renderViewIssues(issues, 'view:assets')}`);
      else if (flag('--check')) console.log('\nPASS: view:assets --check');
    }
    if (flag('--check') && issues.some(({ severity }) => severity === 'error')) process.exitCode = 1;
    return true;
  }
  if (command === 'make:view') {
    const target = positionals[0];
    if (!target) throw new Error('A make:view parancshoz module/resource/view-name cél szükséges.');
    const result = await generateView(target, {
      root,
      dryRun: flag('--dry-run'),
      force: flag('--force'),
      client: flag('--client'),
      email: flag('--email'),
    });
    console.log(json ? JSON.stringify(result, null, 2) : [
      `${result.dryRun ? 'PLAN' : 'DONE'}: make:view ${target}`,
      `Created: ${result.created.length}`,
      `Skipped: ${result.skipped.length}`,
      `Overwritten: ${result.overwritten.length}`,
      ...result.created.map((file) => `+ ${file}`),
    ].join('\n'));
    return true;
  }
  return false;
}

try {
  if (command === 'list') {
    await import('./cli');
    console.log([
      'delivery:list',
      'delivery:inspect',
      'delivery:check',
      'http:contracts',
      'view:list',
      'view:inspect',
      'view:check',
      'view:contracts',
      'view:assets',
      'config:list',
      'config:inspect',
      'config:reference',
      'config:diff',
      'config:drift',
      'config:unused',
      'config:doctor',
      'secrets:check',
      'make:page',
      'make:route-handler',
      'make:action',
      'make:operation',
      'make:vertical-slice',
      'make:view',
    ].join('\n'));
  } else if (command === 'check' || command === 'security:check') {
    await projectCheck(command === 'security:check');
  } else if (!await configurationCommand() && !await viewCommand() && !await deliveryCommand()) {
    await import('./cli');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
