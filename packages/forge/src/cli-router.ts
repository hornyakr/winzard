#!/usr/bin/env node
import path from 'node:path';

import { runProjectChecks } from './checks/project';
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
function positionalArguments(values: readonly string[]): readonly string[] {
  const output: string[] = [];
  for (let index = 1; index < values.length; index += 1) {
    const value = values[index] ?? '';
    if (value === '--project') {
      index += 1;
      continue;
    }
    if (value.startsWith('--')) continue;
    output.push(value);
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

async function projectCheck(): Promise<void> {
  const failures = [...await runProjectChecks(root)];
  const manifest = await loadProjectManifest(root);
  if (manifest.manifest?.capabilities.includes('next-app')) {
    failures.push(...(await buildDeliveryInventory(root)).issues.filter(({ severity }) => severity === 'error'));
  }
  if (failures.length === 0) {
    console.log(`PASS: ${command} (${projectArgument})`);
    return;
  }
  for (const failure of failures) console.error(`[${failure.code}] ${failure.file}: ${failure.message}`);
  console.error(`FAIL: ${command} (${failures.length} hiba)`);
  process.exitCode = 1;
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
      'make:page',
      'make:route-handler',
      'make:action',
      'make:operation',
      'make:vertical-slice',
      'make:view',
    ].join('\n'));
  } else if (command === 'check' || command === 'security:check') {
    await projectCheck();
  } else if (!await viewCommand() && !await deliveryCommand()) {
    await import('./cli');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
