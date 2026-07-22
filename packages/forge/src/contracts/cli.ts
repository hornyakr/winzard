import { spawn } from 'node:child_process';
import path from 'node:path';

import { checkContractCompatibility } from './compatibility';
import { checkContractGeneration, generateContracts } from './generator';
import { buildContractInventory, inspectContracts } from './inventory';
import {
  renderCompatibility,
  renderContractGraph,
  renderContractInspection,
  renderContractIssues,
  renderContractList,
  renderProviderMatrix,
} from './render';
import type { ContractIssue } from './types';

export const CONTRACT_COMMANDS = Object.freeze([
  'contract:list',
  'contract:inspect',
  'contract:check',
  'contract:diff',
  'contract:compat',
  'contract:providers',
  'contract:test',
  'contract:graph',
  'contract:why',
  'contract:docs',
  'contract:generate',
  'deprecation:check',
] as const);

const COMMANDS = new Set<string>(CONTRACT_COMMANDS);

function parse(values: readonly string[]): Readonly<{
  positionals: readonly string[];
  options: ReadonlyMap<string, string | true>;
}> {
  const positionals: string[] = [];
  const options = new Map<string, string | true>();
  for (let index = 1; index < values.length; index += 1) {
    const value = values[index] ?? '';
    if (!value.startsWith('--')) {
      positionals.push(value);
      continue;
    }
    const equals = value.indexOf('=');
    if (equals > 2) {
      options.set(value.slice(0, equals), value.slice(equals + 1));
      continue;
    }
    const next = values[index + 1];
    if (next && !next.startsWith('--')) {
      options.set(value, next);
      index += 1;
    } else {
      options.set(value, true);
    }
  }
  return Object.freeze({ positionals: Object.freeze(positionals), options });
}

function hasErrors(issues: readonly { severity: string }[]): boolean {
  return issues.some(({ severity }) => severity === 'error');
}

function usage(message: string): never {
  throw Object.assign(new Error(message), { exitCode: 2 });
}

async function runReferenceSuites(root: string, suites: readonly string[]): Promise<number> {
  if (suites.length === 0) return 0;
  return await new Promise<number>((resolve, reject) => {
    const child = spawn('pnpm', ['exec', 'vitest', 'run', ...suites.map((suite) => path.join(root, suite))], {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: process.env,
    });
    child.once('error', reject);
    child.once('close', (code: number | null) => resolve(code ?? 1));
  });
}

export async function runContractCli(args: readonly string[]): Promise<boolean> {
  const command = args[0] ?? '';
  if (!COMMANDS.has(command)) return false;
  const parsed = parse(args);
  const option = (name: string): string | null => {
    const value = parsed.options.get(name);
    return typeof value === 'string' ? value : null;
  };
  const flag = (name: string): boolean => parsed.options.get(name) === true;
  const project = option('--project') ?? '.';
  const root = path.resolve(process.cwd(), project);
  const json = flag('--json');

  if (command === 'contract:generate' || command === 'contract:docs') {
    if (flag('--check')) {
      const issues = await checkContractGeneration(root);
      console.log(json ? JSON.stringify({ issues }, null, 2) : renderContractIssues(issues, `${command} --check`));
      if (hasErrors(issues)) process.exitCode = 1;
    } else {
      const files = await generateContracts(root);
      console.log(json ? JSON.stringify({ files }, null, 2) : `GENERATED: ${files.length} contract artifact`);
    }
    return true;
  }

  const inventory = await buildContractInventory(root);

  if (command === 'contract:list') {
    console.log(json ? JSON.stringify(inventory, null, 2) : renderContractList(inventory));
  } else if (command === 'contract:inspect') {
    const query = parsed.positionals[0];
    if (!query) usage('A contract:inspect parancshoz contract ID vagy symbol szükséges.');
    const records = inspectContracts(inventory, query);
    console.log(json ? JSON.stringify({ records }, null, 2) : renderContractInspection(records, inventory.providers));
    if (records.length === 0) process.exitCode = 1;
  } else if (command === 'contract:providers') {
    const query = parsed.positionals[0]?.toLowerCase();
    const providers = query
      ? inventory.providers.filter((provider) => provider.contractId.toLowerCase().includes(query) || provider.id.toLowerCase().includes(query))
      : inventory.providers;
    console.log(json ? JSON.stringify({ providers }, null, 2) : renderProviderMatrix({ ...inventory, providers }));
    if (query && providers.length === 0) process.exitCode = 1;
  } else if (command === 'contract:graph') {
    const format = option('--format') ?? 'text';
    if (format !== 'text' && format !== 'mermaid' && format !== 'json') usage('--format csak text, mermaid vagy json lehet.');
    console.log(format === 'json' || json
      ? JSON.stringify({ fingerprint: inventory.fingerprint, contracts: inventory.contracts, providers: inventory.providers }, null, 2)
      : renderContractGraph(inventory, format));
  } else if (command === 'contract:why') {
    const query = parsed.positionals[0]?.trim().toLowerCase();
    if (!query) usage('A contract:why parancshoz symbol, contract vagy provider szükséges.');
    const contracts = inventory.contracts.filter((contract) => [contract.id, contract.exportName, contract.source, contract.owner].some((value) => value.toLowerCase().includes(query)));
    const providers = inventory.providers.filter((provider) => [provider.id, provider.exportName, provider.source, provider.contractId].some((value) => value.toLowerCase().includes(query)));
    console.log(json ? JSON.stringify({ contracts, providers }, null, 2) : [
      renderContractInspection(contracts, inventory.providers),
      providers.length > 0 ? `\n${renderProviderMatrix({ ...inventory, providers })}` : '',
    ].filter(Boolean).join('\n'));
    if (contracts.length === 0 && providers.length === 0) process.exitCode = 1;
  } else if (command === 'contract:test') {
    const query = parsed.positionals[0]?.toLowerCase();
    const suites = [...new Set(inventory.contracts
      .filter((contract) => !query || contract.id.toLowerCase().includes(query))
      .flatMap((contract) => contract.referenceSuite ? [contract.referenceSuite] : []))];
    if (json) console.log(JSON.stringify({ suites }, null, 2));
    if (suites.length === 0) {
      console.error('[CONTRACT_REFERENCE_SUITE_MISSING] Nincs futtatható reference suite.');
      process.exitCode = 1;
    } else {
      process.exitCode = await runReferenceSuites(root, suites);
    }
  } else if (command === 'contract:diff' || command === 'contract:compat') {
    const base = option('--base') ?? parsed.positionals[0] ?? 'HEAD^';
    const result = await checkContractCompatibility(root, inventory, base);
    console.log(json ? JSON.stringify(result, null, 2) : renderCompatibility(result));
    if (command === 'contract:compat' && !result.compatible) process.exitCode = 1;
  } else if (command === 'deprecation:check') {
    const issues: ContractIssue[] = inventory.issues.filter(({ area }) => area === 'deprecation');
    for (const contract of inventory.contracts.filter(({ stability }) => stability === 'deprecated')) {
      if (!contract.deprecation?.replacement || !contract.deprecation.migration) {
        issues.push(Object.freeze({
          severity: 'error',
          area: 'deprecation',
          code: 'CONTRACT_DEPRECATION_MIGRATION_MISSING',
          file: contract.definitionFile,
          contractId: contract.id,
          message: 'Deprecated contracthoz replacement és migration útvonal szükséges.',
        }));
      }
    }
    console.log(json ? JSON.stringify({ issues }, null, 2) : renderContractIssues(issues, 'deprecation:check'));
    if (hasErrors(issues)) process.exitCode = 1;
  } else {
    const generatedIssues = await checkContractGeneration(root);
    const issues = [...inventory.issues, ...generatedIssues];
    console.log(json ? JSON.stringify({ fingerprint: inventory.fingerprint, issues }, null, 2) : renderContractIssues(issues, 'contract:check'));
    if (hasErrors(issues)) process.exitCode = 1;
  }

  if (hasErrors(inventory.issues) && command !== 'contract:diff') process.exitCode = 1;
  return true;
}
