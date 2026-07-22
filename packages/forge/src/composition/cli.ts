import path from 'node:path';

import { checkCompositionDocumentation, generateCompositionDocumentation } from './docs';
import { checkCompositionGeneration, generateComposition } from './generator';
import { buildCompositionInventory, compositionWhy, inspectComposition } from './inventory';
import {
  renderCompositionAliases,
  renderCompositionGraph,
  renderCompositionInspection,
  renderCompositionIssues,
  renderCompositionLifetimes,
  renderCompositionList,
} from './render';

const COMMANDS = new Set([
  'composition:list',
  'composition:inspect',
  'composition:graph',
  'composition:check',
  'composition:why',
  'composition:docs',
  'composition:generate',
  'service:aliases',
  'service:lifetimes',
]);

function parsedArguments(values: readonly string[]): Readonly<{
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
    if (next !== undefined && !next.startsWith('--')) {
      options.set(value, next);
      index += 1;
    } else {
      options.set(value, true);
    }
  }
  return Object.freeze({ positionals: Object.freeze(positionals), options });
}

export async function runCompositionCli(args: readonly string[]): Promise<boolean> {
  const command = args[0] ?? '';
  if (!COMMANDS.has(command)) return false;
  const parsed = parsedArguments(args);
  const option = (name: string): string | null => {
    const value = parsed.options.get(name);
    return typeof value === 'string' ? value : null;
  };
  const flag = (name: string): boolean => parsed.options.get(name) === true;
  const project = option('--project') ?? '.';
  const root = path.resolve(process.cwd(), project);
  const json = flag('--json');

  if (command === 'composition:generate') {
    if (flag('--check')) {
      const issues = await checkCompositionGeneration(root);
      console.log(json ? JSON.stringify({ issues }, null, 2) : renderCompositionIssues(issues, 'composition:generate --check'));
      if (issues.some(({ severity }) => severity === 'error')) process.exitCode = 1;
    } else {
      const files = await generateComposition(root);
      console.log(json ? JSON.stringify({ files }, null, 2) : `GENERATED: ${files.length} composition artifact`);
    }
    return true;
  }

  if (command === 'composition:docs') {
    if (flag('--check')) {
      const issues = await checkCompositionDocumentation(root);
      console.log(json ? JSON.stringify({ issues }, null, 2) : renderCompositionIssues(issues, 'composition:docs --check'));
      if (issues.some(({ severity }) => severity === 'error')) process.exitCode = 1;
    } else {
      const files = await generateCompositionDocumentation(root);
      console.log(json ? JSON.stringify({ files }, null, 2) : `GENERATED: ${files.length} composition document`);
    }
    return true;
  }

  const inventory = await buildCompositionInventory(root, {
    resolveConfig: flag('--resolve-config'),
  });
  if (command === 'composition:list') {
    console.log(json ? JSON.stringify(inventory, null, 2) : renderCompositionList(inventory));
  } else if (command === 'composition:inspect') {
    const query = parsed.positionals[0];
    if (!query) throw Object.assign(new Error('A composition:inspect parancshoz service ID, port vagy implementáció szükséges.'), { exitCode: 2 });
    const records = inspectComposition(inventory, query);
    console.log(json ? JSON.stringify({ records }, null, 2) : renderCompositionInspection(records));
    if (records.length === 0) process.exitCode = 1;
  } else if (command === 'composition:graph') {
    const format = option('--format') ?? 'text';
    if (!['text', 'mermaid', 'json'].includes(format)) {
      throw Object.assign(new Error('--format csak text, mermaid vagy json lehet.'), { exitCode: 2 });
    }
    console.log(format === 'json' || json
      ? JSON.stringify({ roots: inventory.roots, services: inventory.services, fingerprint: inventory.fingerprint }, null, 2)
      : renderCompositionGraph(inventory, format as 'text' | 'mermaid'));
  } else if (command === 'composition:check') {
    console.log(json ? JSON.stringify({ issues: inventory.issues, fingerprint: inventory.fingerprint }, null, 2) : renderCompositionIssues(inventory.issues, 'composition:check'));
  } else if (command === 'composition:why') {
    const query = parsed.positionals[0];
    if (!query) throw Object.assign(new Error('A composition:why parancshoz service ID szükséges.'), { exitCode: 2 });
    const chain = compositionWhy(inventory, query);
    console.log(json ? JSON.stringify({ chain }, null, 2) : chain.length > 0 ? chain.join(' → ') : `No path to ${query}.`);
    if (chain.length === 0) process.exitCode = 1;
  } else if (command === 'service:aliases') {
    console.log(json ? JSON.stringify({ aliases: inventory.services.flatMap(({ id, aliases }) => aliases.map((alias) => ({ alias, id }))) }, null, 2) : renderCompositionAliases(inventory));
  } else if (command === 'service:lifetimes') {
    console.log(json ? JSON.stringify({ lifetimes: inventory.services.map(({ id, lifetime }) => ({ id, lifetime })) }, null, 2) : renderCompositionLifetimes(inventory));
  }
  if (inventory.issues.some(({ severity }) => severity === 'error')) process.exitCode = 1;
  return true;
}
