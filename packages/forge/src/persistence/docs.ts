import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { buildPersistenceInventory } from './inventory';
import type { PersistenceInventory, PersistenceIssue } from './types';

const DIRECTORY = 'docs/90-generated/persistence';

function schemaDocument(inventory: PersistenceInventory): string {
  const schema = inventory.schema;
  return [
    '# Persistence schema inventory',
    '',
    `Inventory fingerprint: \`${inventory.fingerprint}\``,
    `Schema fingerprint: \`${schema?.fingerprint ?? 'missing'}\``,
    `Provider: \`${schema?.provider ?? 'missing'}\``,
    '',
    '## Models',
    '',
    ...(schema?.models.flatMap((model) => [
      `### ${model.name}`,
      '',
      '| Field | Type | Required | Attributes |',
      '| --- | --- | --- | --- |',
      ...model.fields.map((field) => `| ${field.name} | ${field.type}${field.list ? '[]' : ''} | ${field.optional ? 'no' : 'yes'} | ${[field.id ? 'id' : '', field.unique ? 'unique' : '', field.relation ? 'relation' : '', field.nativeType ? `db.${field.nativeType}` : ''].filter(Boolean).join(', ')} |`),
      '',
      `Indexes: ${model.indexes.map((index) => `\`${index.join(', ')}\``).join(', ') || '-'}`,
      '',
    ]) ?? ['No Prisma schema.']),
  ].join('\n');
}

function repositoryDocument(inventory: PersistenceInventory): string {
  return [
    '# Repository inventory',
    '',
    `Inventory fingerprint: \`${inventory.fingerprint}\``,
    '',
    '| ID | Role | Models | Tenant | OCC | Transaction |',
    '| --- | --- | --- | --- | --- | --- |',
    ...inventory.repositories.map(({ definition, file }) => definition
      ? `| ${definition.id} | ${definition.role} | ${definition.models.join(', ')} | ${definition.tenantScoped} | ${definition.optimisticConcurrency} | ${definition.transaction} |`
      : `| invalid: ${file} | - | - | - | - | - |`),
    '',
  ].join('\n');
}

function queryPlanDocument(inventory: PersistenceInventory): string {
  return [
    '# Query-plan evidence',
    '',
    '| ID | Repository/query | Database | Indexes | Maximum rows | Captured |',
    '| --- | --- | --- | --- | --- | --- |',
    ...inventory.queryPlans.map((plan) => `| ${plan.id} | ${plan.repositoryId}/${plan.queryId} | ${plan.database} | ${plan.indexes.join(', ') || '-'} | ${plan.maximumRows ?? '-'} | ${plan.capturedAt} |`),
    '',
  ].join('\n');
}

function migrationManifest(inventory: PersistenceInventory): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    inventoryFingerprint: inventory.fingerprint,
    schemaFingerprint: inventory.schema?.fingerprint ?? null,
    migrations: inventory.migrations.map(({ id, file, sha256, statements, risks, approved }) => ({ id, file, sha256, statements, risks, approved })),
  }, null, 2)}\n`;
}

function artifacts(inventory: PersistenceInventory): Readonly<Record<string, string>> {
  return Object.freeze({
    [`${DIRECTORY}/schema.md`]: `${schemaDocument(inventory).trim()}\n`,
    [`${DIRECTORY}/repositories.md`]: `${repositoryDocument(inventory).trim()}\n`,
    [`${DIRECTORY}/query-plans.md`]: `${queryPlanDocument(inventory).trim()}\n`,
    [`${DIRECTORY}/migration-manifest.json`]: migrationManifest(inventory),
  });
}

export async function generatePersistenceDocumentation(root: string): Promise<readonly string[]> {
  const inventory = await buildPersistenceInventory(root);
  const generated = artifacts(inventory);
  const files = Object.keys(generated).sort();
  for (const file of files) {
    const target = path.join(root, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, generated[file] ?? '', 'utf8');
  }
  return Object.freeze(files);
}

export async function checkPersistenceDocumentation(root: string): Promise<readonly PersistenceIssue[]> {
  const generated = artifacts(await buildPersistenceInventory(root));
  const issues: PersistenceIssue[] = [];
  for (const [file, expected] of Object.entries(generated)) {
    let actual: string | null = null;
    try {
      actual = await readFile(path.join(root, file), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (actual === null) issues.push({ code: 'PERSISTENCE_GENERATED_MISSING', severity: 'error', file, message: 'A generált persistence evidence hiányzik.' });
    else if (actual !== expected) issues.push({ code: 'PERSISTENCE_GENERATED_DRIFT', severity: 'error', file, message: 'A generált persistence evidence eltér a forrásoktól.' });
  }
  return Object.freeze(issues);
}
