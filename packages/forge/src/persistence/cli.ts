import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { checkPersistenceDocumentation, generatePersistenceDocumentation } from './docs';
import { buildPersistenceInventory } from './inventory';
import { parsePrismaSchema } from './schema';
import { renderDatabaseAbout, renderModel, renderPersistenceIssues, renderRepository } from './render';
import type { PersistenceIssue } from './types';

export const PERSISTENCE_COMMANDS = Object.freeze([
  'database:about', 'database:check', 'database:connections', 'database:readiness',
  'schema:list', 'schema:inspect', 'schema:check', 'schema:diff', 'schema:docs',
  'migration:list', 'migration:inspect', 'migration:check', 'migration:plan', 'migration:drift',
  'repository:list', 'repository:inspect', 'repository:check', 'query:plans',
] as const);

const COMMANDS = new Set<string>(PERSISTENCE_COMMANDS);

function parse(values: readonly string[]) {
  const positionals: string[] = [];
  const options = new Map<string, string | true>();
  for (let index = 1; index < values.length; index += 1) {
    const value = values[index] ?? '';
    if (!value.startsWith('--')) { positionals.push(value); continue; }
    const equals = value.indexOf('=');
    if (equals > 2) { options.set(value.slice(0, equals), value.slice(equals + 1)); continue; }
    const next = values[index + 1];
    if (next && !next.startsWith('--')) { options.set(value, next); index += 1; } else options.set(value, true);
  }
  return { positionals, options };
}

function hasErrors(issues: readonly PersistenceIssue[]): boolean {
  return issues.some(({ severity }) => severity === 'error');
}

function failUsage(message: string): never {
  throw Object.assign(new Error(message), { exitCode: 2 });
}

function print(value: unknown, json: boolean, text: string): void {
  console.log(json ? JSON.stringify(value, null, 2) : text);
}

function issueGroup(issues: readonly PersistenceIssue[], prefixes: readonly string[]): readonly PersistenceIssue[] {
  return issues.filter(({ code }) => prefixes.some((prefix) => code.startsWith(prefix)));
}

export async function runPersistenceCli(args: readonly string[]): Promise<boolean> {
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
  const inventory = await buildPersistenceInventory(root);

  if (command === 'database:about') {
    const portableInventory = { ...inventory, root: project.split(path.sep).join('/') };
    print({ inventory: portableInventory }, json, renderDatabaseAbout(inventory));
    return true;
  }
  if (command === 'database:connections') {
    const result = {
      configured: Boolean(process.env.DATABASE_URL),
      secretRedacted: true,
      poolMax: process.env.DATABASE_POOL_MAX ?? null,
      connectionTimeoutMs: process.env.DATABASE_CONNECTION_TIMEOUT_MS ?? null,
      formula: 'instances × poolMax + migrations + workers + administration',
    };
    print(result, json, [
      `DATABASE_URL: ${result.configured ? 'configured (redacted)' : 'not configured'}`,
      `DATABASE_POOL_MAX: ${result.poolMax ?? 'not configured'}`,
      `DATABASE_CONNECTION_TIMEOUT_MS: ${result.connectionTimeoutMs ?? 'not configured'}`,
      `capacity: ${result.formula}`,
    ].join('\n'));
    return true;
  }
  if (command === 'database:readiness') {
    const readinessIssues = inventory.issues.filter(({ code, file }) => code === 'PERSISTENCE_READINESS_MUTATES' || file.endsWith('/readiness.ts'));
    const result = { staticValidation: !hasErrors(readinessIssues), liveProbeExecuted: false, issues: readinessIssues };
    print(result, json, renderPersistenceIssues(readinessIssues, 'database:readiness (static)'));
    if (hasErrors(readinessIssues)) process.exitCode = 1;
    return true;
  }
  if (command === 'database:check') {
    const issues = [...inventory.issues, ...await checkPersistenceDocumentation(root)];
    print({ fingerprint: inventory.fingerprint, issues }, json, renderPersistenceIssues(issues, 'database:check'));
    if (hasErrors(issues)) process.exitCode = 1;
    return true;
  }
  if (command === 'schema:list') {
    const models = inventory.schema?.models ?? [];
    print({ models, enums: inventory.schema?.enums ?? [] }, json, models.map(({ name, mappedName }) => `${name}${mappedName ? ` → ${mappedName}` : ''}`).join('\n') || 'No models.');
    return true;
  }
  if (command === 'schema:inspect') {
    const name = parsed.positionals[0];
    if (!name) failUsage('A schema:inspect parancshoz modellnév szükséges.');
    const model = inventory.schema?.models.find((value) => value.name === name);
    if (!model) { console.error(`[PERSISTENCE_MODEL_UNKNOWN] ${name}`); process.exitCode = 1; return true; }
    print({ model }, json, renderModel(model));
    return true;
  }
  if (command === 'schema:check') {
    const issues = issueGroup(inventory.issues, ['PERSISTENCE_SCHEMA_', 'PERSISTENCE_PROVIDER_', 'PERSISTENCE_MODEL_']);
    print({ schema: inventory.schema, issues }, json, renderPersistenceIssues(issues, 'schema:check'));
    if (hasErrors(issues)) process.exitCode = 1;
    return true;
  }
  if (command === 'schema:diff') {
    const from = option('--from') ?? parsed.positionals[0];
    const to = option('--to') ?? parsed.positionals[1];
    if (!from || !to) failUsage('A schema:diff parancshoz --from és --to schemafájl szükséges.');
    const left = parsePrismaSchema(await readFile(path.resolve(root, from), 'utf8'), from);
    const right = parsePrismaSchema(await readFile(path.resolve(root, to), 'utf8'), to);
    const leftModels = new Set(left.models.map(({ name }) => name));
    const rightModels = new Set(right.models.map(({ name }) => name));
    const result = {
      equal: left.fingerprint === right.fingerprint,
      from: left.fingerprint,
      to: right.fingerprint,
      addedModels: [...rightModels].filter((name) => !leftModels.has(name)).sort(),
      removedModels: [...leftModels].filter((name) => !rightModels.has(name)).sort(),
    };
    print(result, json, [`equal: ${result.equal}`, `added: ${result.addedModels.join(', ') || '-'}`, `removed: ${result.removedModels.join(', ') || '-'}`].join('\n'));
    if (!result.equal) process.exitCode = 1;
    return true;
  }
  if (command === 'schema:docs') {
    if (flag('--check')) {
      const issues = await checkPersistenceDocumentation(root);
      print({ issues }, json, renderPersistenceIssues(issues, 'schema:docs --check'));
      if (hasErrors(issues)) process.exitCode = 1;
    } else {
      const files = await generatePersistenceDocumentation(root);
      print({ files }, json, `GENERATED: ${files.length} persistence artifact`);
    }
    return true;
  }
  if (command === 'migration:list') {
    print({ migrations: inventory.migrations }, json, inventory.migrations.map(({ id, risks, approved }) => `${id} ${risks.length ? `[${risks.map(({ code }) => code).join(',')}]` : '[safe-static]'}${approved ? ' approved' : ''}`).join('\n') || 'No migrations.');
    return true;
  }
  if (command === 'migration:inspect') {
    const id = parsed.positionals[0];
    if (!id) failUsage('A migration:inspect parancshoz migration ID szükséges.');
    const migration = inventory.migrations.find((value) => value.id === id);
    if (!migration) { console.error(`[PERSISTENCE_MIGRATION_UNKNOWN] ${id}`); process.exitCode = 1; return true; }
    print({ migration }, json, [`${migration.id}`, `file: ${migration.file}`, `sha256: ${migration.sha256}`, `statements: ${migration.statements}`, `approved: ${migration.approved}`, ...migration.risks.map(({ code, message }) => `risk ${code}: ${message}`)].join('\n'));
    return true;
  }
  if (command === 'migration:check' || command === 'migration:drift') {
    const documentationIssues = await checkPersistenceDocumentation(root);
    const issues = command === 'migration:drift'
      ? documentationIssues.filter(({ file }) => file.endsWith('migration-manifest.json'))
      : [...issueGroup(inventory.issues, ['PERSISTENCE_DESTRUCTIVE_MIGRATION_', 'PERSISTENCE_MIGRATION_']), ...documentationIssues.filter(({ file }) => file.endsWith('migration-manifest.json'))];
    print({ migrations: inventory.migrations, issues }, json, renderPersistenceIssues(issues, command));
    if (hasErrors(issues)) process.exitCode = 1;
    return true;
  }
  if (command === 'migration:plan') {
    const plan = inventory.migrations.map((migration) => ({ id: migration.id, apply: true, approved: migration.approved, risks: migration.risks, rollback: migration.risks.length === 0 ? 'roll-forward' : 'explicit runbook required' }));
    print({ dryRun: true, plan }, json, plan.map(({ id, risks, rollback }) => `${id}: ${risks.map(({ code }) => code).join(', ') || 'no static risk'}; ${rollback}`).join('\n') || 'No migrations.');
    return true;
  }
  if (command === 'repository:list') {
    print({ repositories: inventory.repositories }, json, inventory.repositories.map(({ definition, file }) => definition ? `${definition.id} (${definition.role})` : `${file} (invalid)`).join('\n') || 'No repository definitions.');
    return true;
  }
  if (command === 'repository:inspect') {
    const id = parsed.positionals[0];
    if (!id) failUsage('A repository:inspect parancshoz repository ID szükséges.');
    const repository = inventory.repositories.find(({ definition }) => definition?.id === id);
    if (!repository) { console.error(`[PERSISTENCE_REPOSITORY_UNKNOWN] ${id}`); process.exitCode = 1; return true; }
    print({ repository }, json, renderRepository(repository));
    return true;
  }
  if (command === 'repository:check') {
    const issues = inventory.issues.filter(({ code }) => code.startsWith('PERSISTENCE_REPOSITORY_') || code.startsWith('PERSISTENCE_UNSCOPED_') || code.startsWith('PERSISTENCE_UNBOUNDED_') || code.startsWith('PERSISTENCE_QUERY_') || code.startsWith('PERSISTENCE_IMPORT_') || code.startsWith('PERSISTENCE_RAW_'));
    print({ repositories: inventory.repositories, issues }, json, renderPersistenceIssues(issues, 'repository:check'));
    if (hasErrors(issues)) process.exitCode = 1;
    return true;
  }
  const plans = inventory.queryPlans;
  print({ queryPlans: plans }, json, plans.map((plan) => `${plan.id}: ${plan.repositoryId}/${plan.queryId} [${plan.indexes.join(', ')}]`).join('\n') || 'No query-plan evidence.');
  return true;
}
