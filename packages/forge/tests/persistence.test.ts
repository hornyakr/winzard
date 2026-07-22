import { cp, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { PERSISTENCE_COMMANDS, runPersistenceCli } from '../src/persistence/cli';
import { checkPersistenceDocumentation, generatePersistenceDocumentation } from '../src/persistence/docs';
import { buildPersistenceInventory } from '../src/persistence/inventory';
import { parsePrismaSchema } from '../src/persistence/schema';

const fixtureRoot = path.resolve('packages/forge/tests/fixtures/persistence-project');

async function copyFixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'winzard-persistence-'));
  await cp(fixtureRoot, root, { recursive: true });
  return root;
}

describe('Forge persistence platform', () => {
  it('a teljes célparancs-felületet publikálja', () => {
    expect(PERSISTENCE_COMMANDS).toEqual(expect.arrayContaining([
      'database:about',
      'database:check',
      'schema:inspect',
      'schema:docs',
      'migration:drift',
      'repository:check',
      'query:plans',
    ]));
  });

  it('determinista Prisma schema inventoryt épít', async () => {
    const source = await readFile(path.join(fixtureRoot, 'prisma/schema.prisma'), 'utf8');
    const first = parsePrismaSchema(source);
    const second = parsePrismaSchema(source);
    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.provider).toBe('postgresql');
    expect(first.models[0]?.name).toBe('Product');
    expect(first.models[0]?.indexes).toContainEqual(['tenantId', 'status', 'createdAt']);
  });

  it('összeköti a Product schemát, migrációt és repository contractot', async () => {
    const inventory = await buildPersistenceInventory(fixtureRoot);
    expect(inventory.schema?.models.map(({ name }) => name)).toContain('Product');
    expect(inventory.migrations.map(({ id }) => id)).toContain('20260722010000_product');
    expect(inventory.repositories[0]?.definition?.id).toBe('catalog.product');
    expect(inventory.issues.filter(({ severity }) => severity === 'error')).toEqual([]);
    expect(inventory.issues).toContainEqual(expect.objectContaining({ code: 'PERSISTENCE_QUERY_PLAN_MISSING' }));
  });

  it('a database:about JSON nem tartalmaz gépfüggő abszolút rootot', async () => {
    const root = await copyFixture();
    const output: string[] = [];
    const original = console.log;
    console.log = (value?: unknown) => { output.push(String(value)); };
    try {
      expect(await runPersistenceCli(['database:about', '--project', root, '--json'])).toBe(true);
    } finally {
      console.log = original;
    }
    const result = JSON.parse(output.at(-1) ?? '{}') as { inventory?: Record<string, unknown> };
    expect(result.inventory).not.toHaveProperty('root');
  });

  it('generált evidence driftet észlel', async () => {
    const root = await copyFixture();
    const files = await generatePersistenceDocumentation(root);
    expect(files).toHaveLength(4);
    expect(await checkPersistenceDocumentation(root)).toEqual([]);
    const schemaDocument = path.join(root, 'docs/90-generated/persistence/schema.md');
    await writeFile(schemaDocument, `${await readFile(schemaDocument, 'utf8')}drift\n`, 'utf8');
    expect(await checkPersistenceDocumentation(root)).toContainEqual(expect.objectContaining({ code: 'PERSISTENCE_GENERATED_DRIFT' }));
  });

  it('unsafe raw SQL-t és korlátlan findMany-t hibának jelöl', async () => {
    const root = await copyFixture();
    const target = path.join(root, 'src/modules/catalog/product/infrastructure/unsafe.ts');
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, `export async function unsafe(database: any) {\n  await database.$queryRawUnsafe('SELECT * FROM products');\n  return database.product.findMany({ where: {} });\n}\n`, 'utf8');
    const codes = (await buildPersistenceInventory(root)).issues.map(({ code }) => code);
    expect(codes).toContain('PERSISTENCE_RAW_SQL_UNSAFE');
    expect(codes).toContain('PERSISTENCE_UNBOUNDED_FIND_MANY');
  });
});
