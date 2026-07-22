import { createHash } from 'node:crypto';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import ts from 'typescript';

import { parsePrismaSchema } from './schema';
import type {
  MigrationRecord,
  MigrationRisk,
  PersistenceInventory,
  PersistenceIssue,
  QueryPlanEvidence,
  RepositoryDefinition,
  RepositoryQueryDefinition,
  RepositoryRecord,
} from './types';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);
const IGNORED_DIRECTORIES = new Set(['.git', '.next', 'generated', 'node_modules']);

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function projectPath(root: string, value: string): string {
  return path.relative(root, value).split(path.sep).join('/');
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function collectFiles(directory: string): Promise<readonly string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const files: string[] = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory() && !IGNORED_DIRECTORIES.has(entry.name)) files.push(...await collectFiles(target));
    if (entry.isFile()) files.push(target);
  }
  return files.sort();
}

function issue(code: string, file: string, message: string, severity: PersistenceIssue['severity'] = 'error'): PersistenceIssue {
  return Object.freeze({ code, file, message, severity });
}

function literal(node: ts.Expression): unknown {
  if (ts.isParenthesizedExpression(node)) return literal(node.expression);
  if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) return literal(node.expression);
  if (ts.isCallExpression(node) && node.arguments[0]) return literal(node.arguments[0]);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.map((element) => ts.isSpreadElement(element) ? undefined : literal(element));
  }
  if (ts.isObjectLiteralExpression(node)) {
    const output: Record<string, unknown> = {};
    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property)) continue;
      const name = ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) ? property.name.text : null;
      if (name !== null) output[name] = literal(property.initializer);
    }
    return output;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): readonly string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? Object.freeze([...value]) : null;
}

function queryDefinition(value: unknown): RepositoryQueryDefinition | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.bounded !== 'boolean' ||
    typeof value.tenantScoped !== 'boolean') return null;
  const stableOrder = stringArray(value.stableOrder);
  const requiredIndexes = stringArray(value.requiredIndexes);
  if (stableOrder === null || requiredIndexes === null) return null;
  return Object.freeze({ id: value.id, bounded: value.bounded, tenantScoped: value.tenantScoped, stableOrder, requiredIndexes });
}

function repositoryDefinition(value: unknown): RepositoryDefinition | null {
  if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.id !== 'string' || typeof value.port !== 'string' ||
    typeof value.adapter !== 'string' || !['read', 'write', 'read-write'].includes(String(value.role)) ||
    typeof value.tenantScoped !== 'boolean' || typeof value.softDelete !== 'boolean' ||
    typeof value.optimisticConcurrency !== 'boolean' || !['none', 'supported', 'required'].includes(String(value.transaction))) return null;
  const models = stringArray(value.models);
  const queries = Array.isArray(value.queries) ? value.queries.map(queryDefinition) : [];
  if (models === null || queries.some((query) => query === null)) return null;
  return Object.freeze({
    schemaVersion: 1,
    id: value.id,
    port: value.port,
    adapter: value.adapter,
    models,
    role: value.role as RepositoryDefinition['role'],
    tenantScoped: value.tenantScoped,
    softDelete: value.softDelete,
    optimisticConcurrency: value.optimisticConcurrency,
    transaction: value.transaction as RepositoryDefinition['transaction'],
    queries: Object.freeze(queries.filter((query): query is RepositoryQueryDefinition => query !== null)),
  });
}

async function readRepository(root: string, file: string): Promise<RepositoryRecord> {
  const source = await readFile(file, 'utf8');
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let raw: unknown;
  const visit = (node: ts.Node): void => {
    if (raw === undefined && ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) &&
      node.name.text === 'repositoryDefinition' && node.initializer) raw = literal(node.initializer);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  const definition = repositoryDefinition(raw);
  const fileName = projectPath(root, file);
  const issues: PersistenceIssue[] = [];
  if (definition === null) {
    issues.push(issue('PERSISTENCE_REPOSITORY_DEFINITION_INVALID', fileName,
      'A repositoryDefinition csak statikus, 1-es sémájú literal contract lehet.'));
  } else {
    for (const reference of [definition.port, definition.adapter]) {
      const [target = ''] = reference.split('#');
      if (!target || !await exists(path.join(root, target))) {
        issues.push(issue('PERSISTENCE_REPOSITORY_SOURCE_MISSING', fileName, `A hivatkozott repository forrás hiányzik: ${reference}`));
      }
    }
    if (definition.tenantScoped && definition.queries.some((query) => !query.tenantScoped)) {
      issues.push(issue('PERSISTENCE_UNSCOPED_TENANT_QUERY', fileName, 'Tenant-scoped repository tenant nélküli query contractot tartalmaz.'));
    }
    if (definition.queries.some((query) => !query.bounded)) {
      issues.push(issue('PERSISTENCE_UNBOUNDED_FIND_MANY', fileName, 'A repository legalább egy korlátlan query contractot deklarál.'));
    }
    if (definition.queries.some((query) => query.stableOrder.length === 0)) {
      issues.push(issue('PERSISTENCE_QUERY_WITHOUT_STABLE_ORDER', fileName, 'A repository queryből hiányzik a stabil rendezési contract.'));
    }
  }
  return Object.freeze({ file: fileName, definition, issues: Object.freeze(issues) });
}

function migrationRisks(source: string): readonly MigrationRisk[] {
  const risks: MigrationRisk[] = [];
  const add = (code: string, message: string): void => { if (!risks.some((risk) => risk.code === code)) risks.push({ code, message }); };
  if (/\bDROP\s+(?:TABLE|COLUMN|TYPE|INDEX|SCHEMA)\b/iu.test(source)) add('destructive-drop', 'DROP művelet adatvesztést vagy visszafelé inkompatibilitást okozhat.');
  if (/\bALTER\s+TABLE\b[\s\S]*?\bSET\s+NOT\s+NULL\b/iu.test(source)) add('not-null', 'NOT NULL bevezetése backfillt és kompatibilitási tervet igényel.');
  if (/\bALTER\s+(?:TABLE|TYPE)\b/iu.test(source)) add('alter', 'ALTER művelet lock- és rollout-reviewt igényel.');
  if (/\bCREATE\s+(?:UNIQUE\s+)?INDEX\b(?![\s\S]{0,40}\bCONCURRENTLY\b)/iu.test(source)) add('blocking-index', 'Nagy táblán a nem concurrent indexépítés blokkolhat.');
  if (/\bDELETE\s+FROM\b|\bUPDATE\b[\s\S]*?\bSET\b/iu.test(source)) add('data-migration', 'Adatmigráció idempotencia-, chunking- és timeout-reviewt igényel.');
  return Object.freeze(risks.map((risk) => Object.freeze(risk)));
}

async function migrations(root: string): Promise<readonly MigrationRecord[]> {
  const directory = path.join(root, 'prisma/migrations');
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const output: MigrationRecord[] = [];
  for (const entry of entries.filter((value) => value.isDirectory()).sort((left, right) => left.name.localeCompare(right.name))) {
    const absolute = path.join(directory, entry.name, 'migration.sql');
    if (!await exists(absolute)) continue;
    const source = await readFile(absolute, 'utf8');
    output.push(Object.freeze({
      id: entry.name,
      file: projectPath(root, absolute),
      sha256: sha256(source.replace(/\r\n/gu, '\n')),
      statements: source.split(';').filter((statement) => statement.trim().replace(/^--.*$/gmu, '').trim() !== '').length,
      risks: migrationRisks(source),
      approved: await exists(path.join(directory, entry.name, 'migration.approval.json')),
    }));
  }
  return Object.freeze(output);
}

async function queryPlan(file: string, root: string): Promise<QueryPlanEvidence | null> {
  try {
    const value: unknown = JSON.parse(await readFile(file, 'utf8'));
    if (!isRecord(value) || typeof value.id !== 'string' || typeof value.repositoryId !== 'string' ||
      typeof value.queryId !== 'string' || typeof value.database !== 'string' || typeof value.capturedAt !== 'string' ||
      typeof value.planHash !== 'string') return null;
    const indexes = stringArray(value.indexes);
    if (indexes === null || !(value.maximumRows === null || typeof value.maximumRows === 'number')) return null;
    return Object.freeze({ file: projectPath(root, file), id: value.id, repositoryId: value.repositoryId,
      queryId: value.queryId, database: value.database, capturedAt: value.capturedAt, planHash: value.planHash,
      indexes, maximumRows: value.maximumRows as number | null });
  } catch {
    return null;
  }
}

async function sourceIssues(root: string, files: readonly string[]): Promise<readonly PersistenceIssue[]> {
  const issues: PersistenceIssue[] = [];
  for (const file of files.filter((value) => SOURCE_EXTENSIONS.has(path.extname(value)))) {
    const relative = projectPath(root, file);
    const source = await readFile(file, 'utf8');
    if (/\$(?:queryRawUnsafe|executeRawUnsafe)\s*\(/u.test(source)) {
      issues.push(issue('PERSISTENCE_RAW_SQL_UNSAFE', relative, 'Unsafe Prisma raw SQL használata tiltott.'));
    }
    for (const match of source.matchAll(/\.findMany\s*\(\s*\{([\s\S]{0,2400}?)\}\s*\)/gu)) {
      if (!/\btake\s*:/u.test(match[1] ?? '')) issues.push(issue('PERSISTENCE_UNBOUNDED_FIND_MANY', relative, 'A findMany hívásból hiányzik a take korlát.'));
    }
    if (/\binclude\s*:\s*\{[\s\S]{0,1000}?\w+\s*:\s*true/u.test(source)) {
      issues.push(issue('PERSISTENCE_INCLUDE_WILDCARD', relative, 'A teljes relation include helyett explicit nested select szükséges.', 'warning'));
    }
    if (/\$transaction\s*\(\s*async[\s\S]{0,5000}?\b(?:fetch|sendEmail|publish)\s*\(/u.test(source)) {
      issues.push(issue('PERSISTENCE_TRANSACTION_EXTERNAL_IO', relative, 'Interactive transaction külső I/O-t tartalmaz.'));
    }
    if (relative.includes('/application/') && /(?:@prisma\/|generated\/prisma|platform\/database)/u.test(source)) {
      issues.push(issue('PERSISTENCE_IMPORT_IN_APPLICATION', relative, 'Az application réteg persistence implementációt importál.'));
    }
    if (relative.startsWith('src/app/') && /(?:@prisma\/|generated\/prisma|platform\/database\/client)/u.test(source)) {
      issues.push(issue('PERSISTENCE_IMPORT_IN_DELIVERY', relative, 'A delivery réteg közvetlen persistence importot használ.'));
    }
    if (/^\s*['"]use client['"];?/mu.test(source) && /(?:generated\/prisma|Prisma\.)/u.test(source)) {
      issues.push(issue('PERSISTENCE_RECORD_IN_CLIENT_PROP', relative, 'Client Component persistence rekordot vagy generated Prisma típust használ.'));
    }
    if (relative.endsWith('/readiness.ts') && /\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/iu.test(source)) {
      issues.push(issue('PERSISTENCE_READINESS_MUTATES', relative, 'A readiness ellenőrzés nem módosíthat adatot.'));
    }
  }
  return Object.freeze(issues);
}

export async function buildPersistenceInventory(root = process.cwd()): Promise<PersistenceInventory> {
  const allFiles = await collectFiles(root);
  const schemaFile = path.join(root, 'prisma/schema.prisma');
  const schema = await exists(schemaFile) ? parsePrismaSchema(await readFile(schemaFile, 'utf8'), 'prisma/schema.prisma') : null;
  const migrationRecords = await migrations(root);
  const repositoryFiles = allFiles.filter((file) => file.endsWith('.repository.definition.ts'));
  const repositories = Object.freeze(await Promise.all(repositoryFiles.map((file) => readRepository(root, file))));
  const planFiles = allFiles.filter((file) => file.endsWith('.query-plan.json'));
  const queryPlans = Object.freeze((await Promise.all(planFiles.map((file) => queryPlan(file, root))))
    .filter((value): value is QueryPlanEvidence => value !== null));
  const issues: PersistenceIssue[] = [];
  if (schema === null) issues.push(issue('PERSISTENCE_SCHEMA_MISSING', 'prisma/schema.prisma', 'A Prisma schema hiányzik.'));
  else {
    if (schema.provider !== 'postgresql') issues.push(issue('PERSISTENCE_PROVIDER_UNSUPPORTED', schema.file, 'A persistence platform v1 PostgreSQL providert vár.'));
    for (const model of schema.models) {
      if (model.ids.length === 0) issues.push(issue('PERSISTENCE_MODEL_ID_MISSING', schema.file, `A ${model.name} modellből hiányzik az elsődleges kulcs.`));
    }
  }
  for (const migration of migrationRecords) {
    if (migration.risks.some(({ code }) => code === 'destructive-drop') && !migration.approved) {
      issues.push(issue('PERSISTENCE_DESTRUCTIVE_MIGRATION_UNAPPROVED', migration.file,
        'Destruktív migrációhoz adjacent migration.approval.json szükséges.'));
    }
  }
  issues.push(...repositories.flatMap(({ issues: values }) => values));
  const modelNames = new Set(schema?.models.map(({ name }) => name) ?? []);
  for (const repository of repositories) {
    for (const model of repository.definition?.models ?? []) {
      if (!modelNames.has(model)) issues.push(issue('PERSISTENCE_REPOSITORY_MODEL_UNKNOWN', repository.file, `Ismeretlen Prisma modell: ${model}`));
    }
    for (const query of repository.definition?.queries ?? []) {
      for (const requiredIndex of query.requiredIndexes) {
        const covered = queryPlans.some((plan) => plan.repositoryId === repository.definition?.id &&
          plan.queryId === query.id && plan.indexes.includes(requiredIndex));
        if (!covered) issues.push(issue('PERSISTENCE_QUERY_PLAN_MISSING', repository.file,
          `Hiányzó query-plan evidence: ${repository.definition?.id}/${query.id} → ${requiredIndex}`, 'warning'));
      }
    }
  }
  issues.push(...await sourceIssues(root, allFiles));
  const canonical = JSON.stringify({ schema, migrations: migrationRecords, repositories: repositories.map(({ file, definition }) => ({ file, definition })), queryPlans });
  return Object.freeze({ root, schema, migrations: migrationRecords, repositories, queryPlans,
    issues: Object.freeze(issues.sort((left, right) => left.file.localeCompare(right.file) || left.code.localeCompare(right.code))),
    fingerprint: sha256(canonical) });
}
