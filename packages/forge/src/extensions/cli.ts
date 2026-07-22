import { access } from 'node:fs/promises';
import path from 'node:path';

import { buildCapabilityGraph, capabilityWhy } from './capabilities';
import { inspectPackage, packSmoke } from './packages';
import { applyRecipe, planRecipe, planRemoval, removeExtension } from './recipe';
import { loadExtensionManifest } from './schema';
import { loadExtensionState } from './state';
import type { ExtensionIssue, ExtensionManifest, RecipePlan, RecipePlanOperation } from './types';

export const EXTENSION_COMMANDS = Object.freeze([
  'extension:list',
  'extension:inspect',
  'extension:check',
  'extension:add',
  'extension:update',
  'extension:remove',
  'extension:docs',
  'recipe:plan',
  'recipe:apply',
  'recipe:check',
  'recipe:diff',
  'recipe:ownership',
  'capability:graph',
  'capability:why',
  'capability:conflicts',
  'package:check',
  'package:exports',
  'package:pack-smoke',
  'package:consumers',
] as const);

const COMMANDS = new Set<string>(EXTENSION_COMMANDS);

type Parsed = Readonly<{
  positionals: readonly string[];
  options: ReadonlyMap<string, string | true>;
}>;

function parse(values: readonly string[]): Parsed {
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
    } else options.set(value, true);
  }
  return Object.freeze({ positionals: Object.freeze(positionals), options });
}

async function exists(target: string): Promise<boolean> {
  try { await access(target); return true; } catch { return false; }
}

function issueErrors(issues: readonly ExtensionIssue[]): boolean {
  return issues.some(({ severity }) => severity === 'error');
}

function renderIssues(issues: readonly ExtensionIssue[]): string {
  if (issues.length === 0) return 'PASS: nincs extension hiba.';
  return issues.map(({ severity, code, file, message }) => `${severity === 'error' ? 'ERROR' : 'WARN'} [${code}] ${file}: ${message}`).join('\n');
}

function renderOperations(operations: readonly RecipePlanOperation[]): string {
  if (operations.length === 0) return 'No changes.';
  return operations.map((operation) => {
    if (operation.kind === 'create-file') return `+ file ${operation.path} (${operation.ownership})`;
    if (operation.kind === 'update-file') return `~ file ${operation.path} (${operation.ownership})`;
    if (operation.kind === 'delete-file') return `- file ${operation.path}`;
    if (operation.kind === 'add-capability') return `+ capability ${operation.capability}`;
    if (operation.kind === 'remove-capability') return `- capability ${operation.capability}`;
    if (operation.kind === 'add-runtime-dependency') return `+ dependency ${operation.name}@${operation.version}`;
    if (operation.kind === 'add-development-dependency') return `+ devDependency ${operation.name}@${operation.version}`;
    if (operation.kind === 'remove-runtime-dependency') return `- dependency ${operation.name}`;
    if (operation.kind === 'remove-development-dependency') return `- devDependency ${operation.name}`;
    return operation.kind satisfies never;
  }).join('\n');
}

function renderPlan(plan: RecipePlan): string {
  return [
    `Recipe: ${plan.recipe.name}@${plan.recipe.version}`,
    `Project: ${plan.projectRoot}`,
    `Source: ${plan.sourceRoot}`,
    '',
    renderOperations(plan.operations),
    ...(plan.unchanged.length > 0 ? ['', `Unchanged: ${plan.unchanged.length}`, ...plan.unchanged.map((item) => `= ${item}`)] : []),
    ...(plan.issues.length > 0 ? ['', renderIssues(plan.issues)] : []),
  ].join('\n');
}

async function resolveExtensionSource(projectRoot: string, value: string): Promise<string> {
  const direct = path.resolve(process.cwd(), value);
  if (await exists(direct)) return direct;
  const projectLocal = path.join(projectRoot, 'extensions', value);
  if (await exists(projectLocal)) return projectLocal;
  throw Object.assign(new Error(`EXTENSION_SOURCE_NOT_FOUND: ${value}`), { exitCode: 2 });
}

async function resolveRecipeSource(projectRoot: string, value: string): Promise<string> {
  const direct = path.resolve(process.cwd(), value);
  if (await exists(path.join(direct, 'recipe.json'))) return direct;
  const projectLocal = path.join(projectRoot, 'recipes', value);
  if (await exists(path.join(projectLocal, 'recipe.json'))) return projectLocal;
  throw Object.assign(new Error(`EXTENSION_RECIPE_MISSING: ${value}`), { exitCode: 2 });
}

async function extensionAndPlan(projectRoot: string, sourceValue: string): Promise<Readonly<{ manifest: ExtensionManifest | null; plan: RecipePlan | null; issues: readonly ExtensionIssue[] }>> {
  const source = await resolveExtensionSource(projectRoot, sourceValue);
  const loaded = await loadExtensionManifest(source);
  if (!loaded.manifest) return { manifest: null, plan: null, issues: loaded.issues };
  const graph = await buildCapabilityGraph(projectRoot, [loaded.manifest]);
  const issues: ExtensionIssue[] = [...loaded.issues, ...graph.issues];
  if (!loaded.manifest.recipe) {
    issues.push({ severity: 'error', area: 'recipe', code: 'EXTENSION_RECIPE_MISSING', file: loaded.manifest.sourceFile, message: 'Az extension lifecycle v1 explicit recipe-t igényel.' });
    return { manifest: loaded.manifest, plan: null, issues };
  }
  const recipeRoot = path.resolve(source, loaded.manifest.recipe.path);
  const plan = await planRecipe(projectRoot, recipeRoot, loaded.manifest);
  issues.push(...plan.issues);
  return { manifest: loaded.manifest, plan, issues };
}

async function inspectLocalPackages(manifest: ExtensionManifest): Promise<readonly ExtensionIssue[]> {
  const issues: ExtensionIssue[] = [];
  for (const declaration of [...manifest.packages.runtime, ...manifest.packages.development]) {
    const packageFolder = declaration.name.split('/').at(-1) ?? declaration.name;
    const candidates = [
      path.join(manifest.sourceRoot, 'packages', packageFolder),
      path.join(manifest.sourceRoot, 'packages', packageFolder.replace(/^.*-/u, '')),
    ];
    const packageRoot = (await Promise.all(candidates.map(async (candidate) => ({ candidate, present: await exists(path.join(candidate, 'package.json')) })))).find(({ present }) => present)?.candidate;
    if (!packageRoot) continue;
    issues.push(...(await inspectPackage(packageRoot)).issues);
  }
  return Object.freeze(issues);
}

export async function runExtensionCli(args: readonly string[]): Promise<boolean> {
  const command = args[0] ?? '';
  if (!COMMANDS.has(command)) return false;
  const parsed = parse(args);
  const option = (name: string): string | null => {
    const value = parsed.options.get(name);
    return typeof value === 'string' ? value : null;
  };
  const flag = (name: string): boolean => parsed.options.get(name) === true;
  const projectArgument = option('--project') ?? '.';
  const projectRoot = path.resolve(process.cwd(), projectArgument);
  const json = flag('--json');
  const requiredArgument = (label: string): string => {
    const value = parsed.positionals[0];
    if (!value) throw Object.assign(new Error(`${label} argumentum szükséges.`), { exitCode: 2 });
    return value;
  };

  if (command === 'extension:list') {
    const state = await loadExtensionState(projectRoot);
    console.log(json ? JSON.stringify(state, null, 2) : state.extensions.length === 0
      ? 'No installed extensions.'
      : state.extensions.map(({ name, version, capabilities }) => `${name}@${version} [${capabilities.join(', ')}]`).join('\n'));
    return true;
  }

  if (command === 'extension:inspect' || command === 'extension:check' || command === 'extension:docs') {
    const result = await extensionAndPlan(projectRoot, requiredArgument('Extension source'));
    const packageIssues = result.manifest ? await inspectLocalPackages(result.manifest) : [];
    const issues = [...result.issues, ...packageIssues];
    if (command === 'extension:inspect') {
      console.log(json ? JSON.stringify({ manifest: result.manifest, plan: result.plan, issues }, null, 2) : [
        result.manifest ? `${result.manifest.displayName} (${result.manifest.name}@${result.manifest.version})` : 'Invalid extension.',
        result.manifest ? `Provides: ${result.manifest.provides.join(', ') || '-'}` : '',
        result.manifest ? `Requires: ${result.manifest.requires.join(', ') || '-'}` : '',
        result.plan ? `\n${renderPlan(result.plan)}` : '',
        issues.length > 0 ? `\n${renderIssues(issues)}` : '',
      ].filter(Boolean).join('\n'));
    } else if (command === 'extension:docs') {
      console.log(json ? JSON.stringify({ documentation: result.manifest?.documentation ?? null, issues }, null, 2) : result.manifest?.documentation
        ? `Documentation: ${result.manifest.documentation.entry}\nConsumer pack: ${result.manifest.documentation.consumerPack ?? '-'}`
        : 'No extension documentation declared.');
    } else {
      console.log(json ? JSON.stringify({ issues }, null, 2) : renderIssues(issues));
    }
    if (issueErrors(issues)) process.exitCode = 1;
    return true;
  }

  if (command === 'extension:add' || command === 'extension:update') {
    const result = await extensionAndPlan(projectRoot, requiredArgument('Extension source'));
    if (!result.plan || issueErrors(result.issues)) {
      console.log(json ? JSON.stringify({ issues: result.issues }, null, 2) : renderIssues(result.issues));
      process.exitCode = 1;
      return true;
    }
    const state = await loadExtensionState(projectRoot);
    const installed = state.extensions.some(({ name }) => name === result.manifest?.name);
    if (command === 'extension:add' && installed) throw Object.assign(new Error('EXTENSION_ALREADY_INSTALLED'), { exitCode: 1 });
    if (command === 'extension:update' && !installed) throw Object.assign(new Error('EXTENSION_NOT_INSTALLED'), { exitCode: 1 });
    if (flag('--dry-run')) {
      console.log(json ? JSON.stringify(result.plan, null, 2) : renderPlan(result.plan));
      return true;
    }
    const applied = await applyRecipe(result.plan);
    console.log(json ? JSON.stringify({ extension: applied, operations: result.plan.operations }, null, 2) : `DONE: ${applied.name}@${applied.version}\n${renderOperations(result.plan.operations)}`);
    return true;
  }

  if (command === 'extension:remove') {
    const name = requiredArgument('Extension name');
    const removal = await planRemoval(projectRoot, name);
    if (json || flag('--dry-run')) console.log(json ? JSON.stringify(removal, null, 2) : renderOperations(removal.operations));
    if (issueErrors(removal.issues)) {
      if (!json) console.error(renderIssues(removal.issues));
      process.exitCode = 1;
      return true;
    }
    if (!flag('--dry-run')) {
      await removeExtension(projectRoot, name);
      if (!json) console.log(`REMOVED: ${name}`);
    }
    return true;
  }

  if (command.startsWith('recipe:')) {
    if (command === 'recipe:ownership') {
      const name = requiredArgument('Extension or recipe name');
      const state = await loadExtensionState(projectRoot);
      const extension = state.extensions.find((item) => item.name === name || item.recipe === name);
      if (!extension) {
        console.error(`[EXTENSION_NOT_INSTALLED] ${name}`);
        process.exitCode = 1;
      } else console.log(json ? JSON.stringify({ files: extension.files }, null, 2) : extension.files.map(({ path: file, ownership, outputHash }) => `${ownership}\t${outputHash}\t${file}`).join('\n'));
      return true;
    }
    const source = await resolveRecipeSource(projectRoot, requiredArgument('Recipe'));
    const plan = await planRecipe(projectRoot, source);
    if (command === 'recipe:apply' && !flag('--dry-run') && !issueErrors(plan.issues)) {
      const applied = await applyRecipe(plan);
      console.log(json ? JSON.stringify({ extension: applied, plan }, null, 2) : `DONE: ${applied.name}@${applied.version}\n${renderOperations(plan.operations)}`);
    } else console.log(json ? JSON.stringify(plan, null, 2) : renderPlan(plan));
    if (issueErrors(plan.issues)) process.exitCode = 1;
    return true;
  }

  if (command.startsWith('capability:')) {
    const graph = await buildCapabilityGraph(projectRoot);
    if (command === 'capability:why') {
      const target = requiredArgument('Capability');
      const lines = capabilityWhy(graph, target);
      console.log(json ? JSON.stringify({ target, lines, issues: graph.issues }, null, 2) : lines.join('\n'));
      if (lines.length === 0) process.exitCode = 1;
    } else if (command === 'capability:conflicts') {
      const issues = graph.issues.filter(({ code }) => code.includes('CONFLICT'));
      console.log(json ? JSON.stringify({ issues }, null, 2) : renderIssues(issues));
      if (issueErrors(issues)) process.exitCode = 1;
    } else {
      console.log(json ? JSON.stringify(graph, null, 2) : graph.nodes.map(({ id, providers, requiredBy, installed }) => `${installed ? '*' : '-'} ${id} <- ${providers.join(', ') || '-'} -> ${requiredBy.join(', ') || '-'}`).join('\n'));
      if (issueErrors(graph.issues)) process.exitCode = 1;
    }
    return true;
  }

  if (command.startsWith('package:')) {
    if (command === 'package:consumers') {
      const name = requiredArgument('Package name');
      const state = await loadExtensionState(projectRoot);
      const consumers = state.extensions.filter(({ runtimeDependencies, developmentDependencies }) => runtimeDependencies.includes(name) || developmentDependencies.includes(name));
      console.log(json ? JSON.stringify({ package: name, consumers }, null, 2) : consumers.map(({ name: extension, version }) => `${extension}@${version}`).join('\n') || 'No extension consumers.');
      return true;
    }
    const packageRoot = path.resolve(process.cwd(), requiredArgument('Package path'));
    if (command === 'package:pack-smoke') {
      const result = await packSmoke(packageRoot);
      console.log(json ? JSON.stringify(result, null, 2) : [result.archive ? `PACKED: ${result.archive}` : 'PACK FAILED', renderIssues(result.issues)].join('\n'));
      if (issueErrors(result.issues)) process.exitCode = 1;
      return true;
    }
    const inspection = await inspectPackage(packageRoot);
    if (command === 'package:exports') {
      console.log(json ? JSON.stringify({ exports: inspection.exports, issues: inspection.issues }, null, 2) : inspection.exports.join('\n'));
    } else console.log(json ? JSON.stringify(inspection, null, 2) : [
      `${inspection.name ?? '<unknown>'}@${inspection.version ?? '<unknown>'}`,
      `Exports: ${inspection.exports.join(', ') || '-'}`,
      `Files: ${inspection.files.join(', ') || '-'}`,
      renderIssues(inspection.issues),
    ].join('\n'));
    if (issueErrors(inspection.issues)) process.exitCode = 1;
    return true;
  }

  return true;
}
