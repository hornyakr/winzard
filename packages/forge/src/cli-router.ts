#!/usr/bin/env node
import path from 'node:path';

import { runProjectChecks } from './checks/project';
import { checkDeliveryDocumentation, generateDeliveryDocumentation } from './delivery/docs';
import { generateDeliverySlice } from './delivery/generator';
import { buildDeliveryInventory, inspectDelivery } from './delivery/inventory';
import { renderDeliveryInspection, renderDeliveryIssues, renderDeliveryList } from './delivery/render';
import type { DeliveryGenerationKind } from './delivery/types';
import { loadProjectManifest } from './manifest';

const args = process.argv.slice(2);
const command = args[0] ?? 'list';
const positionals = args.slice(1).filter((value) => !value.startsWith('--'));
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

async function projectCheck(): Promise<void> {
  const failures = [...await runProjectChecks(root)];
  const manifest = await loadProjectManifest(root);
  if (manifest.manifest?.capabilities.includes('next-app')) {
    failures.push(...(await buildDeliveryInventory(root)).issues.filter(({ severity }) => severity === 'error'));
  }
  if (failures.length === 0) { console.log(`PASS: ${command} (${projectArgument})`); return; }
  for (const failure of failures) console.error(`[${failure.code}] ${failure.file}: ${failure.message}`);
  console.error(`FAIL: ${command} (${failures.length} hiba)`);
  process.exitCode = 1;
}

async function deliveryCommand(): Promise<boolean> {
  if (command === 'delivery:list') {
    const inventory = await buildDeliveryInventory(root);
    console.log(json ? JSON.stringify(inventory, null, 2) : renderDeliveryList(inventory)); return true;
  }
  if (command === 'delivery:inspect') {
    const value = positionals[0];
    if (!value) throw new Error('A delivery:inspect parancshoz entrypoint vagy route szükséges.');
    const records = inspectDelivery(await buildDeliveryInventory(root), value);
    if (records.length === 0) process.exitCode = 1;
    console.log(json ? JSON.stringify({ records }, null, 2) : renderDeliveryInspection(records)); return true;
  }
  if (command === 'delivery:check') { await deliveryCheck(); return true; }
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
    ['make:page', 'page'], ['make:route-handler', 'route-handler'], ['make:action', 'action'],
    ['make:operation', 'operation'], ['make:vertical-slice', 'vertical-slice'],
  ]).get(command);
  if (generation) {
    const target = positionals[0];
    if (!target) throw new Error(`A ${command} parancshoz cél szükséges.`);
    const result = await generateDeliverySlice(generation, target, { root, dryRun: flag('--dry-run'), force: flag('--force') });
    console.log(json ? JSON.stringify(result, null, 2) : [
      `${result.dryRun ? 'PLAN' : 'DONE'}: ${command} ${target}`,
      `Created: ${result.created.length}`, `Skipped: ${result.skipped.length}`, `Overwritten: ${result.overwritten.length}`,
      ...result.created.map((file) => `+ ${file}`),
    ].join('\n'));
    return true;
  }
  return false;
}

try {
  if (command === 'check' || command === 'security:check') await projectCheck();
  else if (!await deliveryCommand()) await import('./cli');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
