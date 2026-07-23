import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import { checkTestingDocumentation, generateTestingDocumentation } from './docs';
import { buildTestingInventory, impactedTestingSuites, inspectTestingSuites } from './inventory';
import {
  renderTestingInspection,
  renderTestingIssues,
  renderTestingList,
  renderTestingMatrix,
  renderTestingQuarantine,
} from './render';
import type { TestingIssue } from './types';

const execFileAsync = promisify(execFile);

export const TESTING_COMMANDS = Object.freeze([
  'test:list',
  'test:inspect',
  'test:check',
  'test:matrix',
  'test:impact',
  'test:fixtures',
  'test:flaky',
  'test:coverage',
  'test:docs',
] as const);

const COMMANDS = new Set<string>(TESTING_COMMANDS);

function parse(values: readonly string[]) {
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
    } else options.set(value, true);
  }
  return { positionals, options };
}

function hasErrors(issues: readonly TestingIssue[]): boolean {
  return issues.some(({ severity }) => severity === 'error');
}

function failUsage(message: string): never {
  throw Object.assign(new Error(message), { exitCode: 2 });
}

function print(value: unknown, json: boolean, text: string): void {
  console.log(json ? JSON.stringify(value, null, 2) : text);
}

async function changedFiles(root: string, base: string): Promise<readonly string[]> {
  try {
    const { stdout } = await execFileAsync('git', ['diff', '--name-only', base, 'HEAD'], { cwd: root });
    return Object.freeze(stdout.split(/\r?\n/u).map((value) => value.trim()).filter(Boolean));
  } catch {
    return Object.freeze([]);
  }
}

export async function runTestingCli(args: readonly string[]): Promise<boolean> {
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

  if (command === 'test:docs') {
    if (flag('--check')) {
      const issues = await checkTestingDocumentation(root);
      print({ issues }, json, renderTestingIssues(issues, 'test:docs --check'));
      if (hasErrors(issues)) process.exitCode = 1;
    } else {
      const files = await generateTestingDocumentation(root);
      print({ files }, json, `GENERATED: ${files.length} testing document`);
    }
    return true;
  }

  const inventory = await buildTestingInventory(root);
  if (command === 'test:list') {
    print(inventory, json, renderTestingList(inventory));
    return true;
  }
  if (command === 'test:inspect') {
    const value = parsed.positionals[0];
    if (!value) failUsage('A test:inspect parancshoz suite ID, owner, layer, runtime vagy fájl szükséges.');
    const suites = inspectTestingSuites(inventory, value);
    print({ suites }, json, renderTestingInspection(suites));
    if (suites.length === 0) process.exitCode = 1;
    return true;
  }
  if (command === 'test:matrix') {
    print({ fingerprint: inventory.fingerprint, suites: inventory.suites }, json, renderTestingMatrix(inventory));
    return true;
  }
  if (command === 'test:impact') {
    const base = option('--changed-from') ?? option('--base');
    const changed = base ? await changedFiles(root, base) : [];
    const suites = impactedTestingSuites(inventory, changed);
    print({ base, changedFiles: changed, conservativeFallback: changed.length === 0, suites }, json, renderTestingInspection(suites));
    return true;
  }
  if (command === 'test:flaky') {
    print({ quarantine: inventory.quarantine }, json, renderTestingQuarantine(inventory));
    const expired = inventory.issues.filter(({ code }) => code === 'TEST_QUARANTINE_EXPIRED');
    if (expired.length > 0) process.exitCode = 1;
    return true;
  }
  if (command === 'test:coverage') {
    const suites = inventory.suites.filter(({ coverage }) => coverage);
    print({ suites }, json, renderTestingInspection(suites));
    return true;
  }
  const issues = command === 'test:fixtures'
    ? inventory.issues.filter(({ code }) => code.startsWith('TEST_FIXTURE_'))
    : inventory.issues;
  print({ fingerprint: inventory.fingerprint, suites: inventory.suites, issues }, json, renderTestingIssues(issues, command));
  if (hasErrors(issues)) process.exitCode = 1;
  return true;
}
