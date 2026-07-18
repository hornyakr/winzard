import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import ts from 'typescript';

import { HTTP_METHODS, type HttpMethod, type RouteRuntime } from '../routing/types';
import type { DeliveryInventory, DeliveryIssue, DeliveryOutputKind, DeliveryRecord } from './types';

const SOURCE_EXTENSIONS = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/u;
const ROUTE_ENTRYPOINT = /\/(page|route)\.(?:ts|tsx|js|jsx|mjs|cjs)$/u;
const ACTION_ENTRYPOINT = /(?:^|\/)\w[\w.-]*\.actions?\.(?:ts|tsx|js|jsx|mjs|cjs)$/u;

function projectPath(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join('/');
}

async function exists(file: string): Promise<boolean> {
  try { await access(file); return true; } catch { return false; }
}

async function collect(directory: string): Promise<readonly string[]> {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  const output: string[] = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'generated') continue;
    const current = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await collect(current));
    else if (entry.isFile() && SOURCE_EXTENSIONS.test(entry.name)) output.push(current);
  }
  return output.sort();
}

function scriptKind(file: string): ts.ScriptKind {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (file.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (/\.(?:js|mjs|cjs)$/u.test(file)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function parse(file: string, source: string): ts.SourceFile {
  return ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind(file));
}

function nodeModifiers(node: ts.Node): readonly ts.Modifier[] {
  return ts.canHaveModifiers(node) ? ts.getModifiers(node) ?? [] : [];
}

function isExported(node: ts.Node): boolean {
  return nodeModifiers(node).some(({ kind }) => kind === ts.SyntaxKind.ExportKeyword);
}

function isAsync(node: ts.Node): boolean {
  return nodeModifiers(node).some(({ kind }) => kind === ts.SyntaxKind.AsyncKeyword);
}

function routeFromEntrypoint(appRoot: string, file: string): string {
  const relative = path.relative(appRoot, path.dirname(file));
  const visible = relative === '' ? [] : relative.split(path.sep).filter((segment) =>
    !/^\(.+\)$/u.test(segment) && !segment.startsWith('@'));
  return visible.length === 0 ? '/' : `/${visible.join('/')}`;
}

function exportedMethods(sourceFile: ts.SourceFile): readonly HttpMethod[] {
  const result = new Set<HttpMethod>();
  for (const statement of sourceFile.statements) {
    const exported = isExported(statement);
    if (!exported) continue;
    if (ts.isFunctionDeclaration(statement) && statement.name && HTTP_METHODS.includes(statement.name.text as HttpMethod)) {
      result.add(statement.name.text as HttpMethod);
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && HTTP_METHODS.includes(declaration.name.text as HttpMethod)) {
          result.add(declaration.name.text as HttpMethod);
        }
      }
    }
  }
  return HTTP_METHODS.filter((method) => result.has(method));
}

function exportedAsyncFunctions(sourceFile: ts.SourceFile): readonly string[] {
  const output: string[] = [];
  for (const statement of sourceFile.statements) {
    const exported = isExported(statement);
    if (!exported) continue;
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      const async = isAsync(statement);
      if (async) output.push(statement.name.text);
    }
  }
  return output.sort();
}

function runtime(source: string): RouteRuntime {
  const match = source.match(/export\s+const\s+runtime\s*=\s*['"](nodejs|edge)['"]/u);
  return match?.[1] === 'nodejs' || match?.[1] === 'edge' ? match[1] : 'unknown';
}

function names(source: string, pattern: RegExp): readonly string[] {
  const values = new Set<string>();
  for (const match of source.matchAll(pattern)) if (match[1]) values.add(match[1]);
  return [...values].sort();
}

function outputKinds(source: string, kind: DeliveryRecord['kind']): readonly DeliveryOutputKind[] {
  const output = new Set<DeliveryOutputKind>();
  if (kind === 'page') output.add('react-ui');
  if (kind === 'route-handler' || /\b(?:Response|NextResponse)\b/u.test(source)) output.add('response');
  if (kind === 'server-action') output.add('action-state');
  if (/\bredirect\s*\(/u.test(source)) output.add('redirect');
  if (/\bnotFound\s*\(/u.test(source)) output.add('not-found');
  if (/\bReadableStream\b|text\/event-stream/u.test(source)) output.add('stream');
  return [...output].sort();
}

function cachePolicy(source: string): string | null {
  if (/no-store/u.test(source)) return 'no-store';
  const match = source.match(/['"]Cache-Control['"]\s*:\s*['"]([^'"]+)['"]/u);
  return match?.[1] ?? null;
}

async function relatedTests(root: string, entrypoint: string): Promise<readonly string[]> {
  const candidates: string[] = [];
  if (entrypoint.startsWith('src/app/api/lucky/number/')) {
    candidates.push('tests/unit/app/api/lucky/number/routing.test.ts');
  }
  if (entrypoint.endsWith('lucky-number.actions.ts')) {
    candidates.push('tests/unit/modules/demo/lucky-number/lucky-number.actions.test.ts');
  }
  const present: string[] = [];
  for (const candidate of candidates) if (await exists(path.join(root, candidate))) present.push(candidate);
  return present;
}

function issue(code: string, file: string, message: string): DeliveryIssue {
  return { severity: 'error', code, file, message };
}

function inspectIssues(record: DeliveryRecord, source: string): readonly DeliveryIssue[] {
  const failures: DeliveryIssue[] = [];
  const file = record.entrypoint;
  if (/\bprocess\.env\b/u.test(source)) failures.push(issue('DELIVERY_PROCESS_ENV_ACCESS', file, 'A delivery entrypoint közvetlen process.env hozzáférést használ.'));
  if (/\bredirect\s*\(\s*(?:request\.|formData\.|searchParams|params)/u.test(source)) failures.push(issue('DELIVERY_UNSAFE_REDIRECT', file, 'A redirect célja közvetlenül bizalmatlan inputból származik.'));
  if (/Response\.json\s*\([^)]*(?:error\.issues|String\s*\(\s*error\s*\)|error\.message)/su.test(source)) failures.push(issue('DELIVERY_RAW_ERROR_RESPONSE', file, 'A válasz nyers belső hibaobjektumot vagy exceptionüzenetet publikál.'));
  if (record.kind === 'route-handler' && /request\.(?:json|formData|text|arrayBuffer)\s*\(/u.test(source) && !/\b(?:safeParse|\.parse)\s*\(/u.test(source)) failures.push(issue('DELIVERY_UNVALIDATED_BODY', file, 'A request body schema-validáció nélkül kerül felhasználásra.'));
  if (/Response\.json\s*\(\s*(?:domain\w*|new\s+[A-Z]\w*)/u.test(source)) failures.push(issue('DELIVERY_DOMAIN_ENTITY_RESPONSE', file, 'A delivery réteg domain objektumot ad vissza explicit presenter nélkül.'));
  if (record.methods.length === 1 && record.methods.includes('GET') && /\.commands\.|\.(?:save|delete|update|create|approve)\.execute\s*\(/u.test(source)) failures.push(issue('DELIVERY_GET_MUTATION', file, 'A GET entrypoint állapotváltoztató műveletet hív.'));
  if (/\btenantId\s*:\s*(?:body|parsed\.data|formData|request)/u.test(source)) failures.push(issue('DELIVERY_UNSCOPED_TENANT_INPUT', file, 'A tenant scope bizalmatlan request inputból származik.'));
  if (record.kind === 'page' && /\b(?:cookies|headers)\s*\(\)[\s\S]*\.set\s*\(/u.test(source)) failures.push(issue('DELIVERY_SESSION_WRITE_DURING_RENDER', file, 'A Page renderelés közben session/cookie írást végez.'));
  const stream = source.search(/\bReadableStream\b|text\/event-stream/u);
  const auth = source.search(/\b(?:requireActor|getActor|authorize|can[A-Z]\w*)\s*\(/u);
  if (stream >= 0 && (auth < 0 || stream < auth)) failures.push(issue('DELIVERY_STREAM_BEFORE_AUTH', file, 'A stream létrehozása authentikáció/authorizáció előtt történik.'));
  if (record.kind === 'server-action') {
    const sourceFile = parse(file, source);
    const invalid = sourceFile.statements.some((statement) => {
      const exported = isExported(statement);
      if (!exported) return false;
      if (ts.isFunctionDeclaration(statement)) return !isAsync(statement);
      return ts.isVariableStatement(statement);
    });
    if (invalid) failures.push(issue('DELIVERY_SERVER_ACTION_EXPORT_INVALID', file, 'A use server modul csak async függvényt exportálhat.'));
  }
  return failures;
}

async function recordFor(root: string, appRoot: string, file: string, source: string): Promise<DeliveryRecord | null> {
  const projectFile = projectPath(root, file);
  const isRoute = ROUTE_ENTRYPOINT.test(`/${projectFile}`);
  const isAction = ACTION_ENTRYPOINT.test(projectFile) && /^\s*['"]use server['"];?/u.test(source);
  if (!isRoute && !isAction) return null;
  const page = /\/page\./u.test(`/${projectFile}`);
  const kind: DeliveryRecord['kind'] = isAction ? 'server-action' : page ? 'page' : 'route-handler';
  const sourceFile = parse(file, source);
  return {
    kind,
    entrypoint: projectFile,
    route: kind === 'server-action' ? null : routeFromEntrypoint(appRoot, file),
    methods: kind === 'page' ? ['GET'] : kind === 'route-handler' ? exportedMethods(sourceFile) : [],
    runtime: runtime(source),
    exportedActions: kind === 'server-action' ? exportedAsyncFunctions(sourceFile) : [],
    inputSchemas: names(source, /\b([A-Za-z]\w*Schema)\.(?:safeParse|parse)\s*\(/gu),
    actorResolvers: names(source, /\b((?:get|require|resolve)[A-Z]\w*Actor|\w+ActorFromRequest)\s*\(/gu),
    authorizationCalls: names(source, /\b([\w.]+\.(?:can|authorize|assertAllowed)[A-Z]\w*)\s*\(/gu),
    applicationOperations: names(source, /\b([\w.]+\.(?:queries|commands)\.\w+)\.execute\s*\(/gu),
    outputKinds: outputKinds(source, kind),
    cachePolicy: cachePolicy(source),
    streaming: /\bReadableStream\b|text\/event-stream/u.test(source),
    tests: await relatedTests(root, projectFile),
  };
}

export async function buildDeliveryInventory(root = process.cwd()): Promise<DeliveryInventory> {
  const appRoot = path.join(root, 'src/app');
  const sourceRoot = path.join(root, 'src');
  if (!await exists(sourceRoot)) return { schemaVersion: 1, sourceRoot: 'src', records: [], issues: [] };
  const records: DeliveryRecord[] = [];
  const sources = new Map<string, string>();
  for (const file of await collect(sourceRoot)) {
    const source = await readFile(file, 'utf8');
    const record = await recordFor(root, appRoot, file, source);
    if (record) { records.push(record); sources.set(record.entrypoint, source); }
  }
  const rank: Record<DeliveryRecord['kind'], number> = { page: 0, 'route-handler': 1, 'server-action': 2 };
  records.sort((a, b) => rank[a.kind] - rank[b.kind] || a.entrypoint.localeCompare(b.entrypoint));
  const issues = records.flatMap((record) => inspectIssues(record, sources.get(record.entrypoint) ?? ''))
    .sort((a, b) => a.file.localeCompare(b.file) || a.code.localeCompare(b.code));
  return { schemaVersion: 1, sourceRoot: 'src', records, issues };
}

export function inspectDelivery(inventory: DeliveryInventory, value: string): readonly DeliveryRecord[] {
  const normalized = value.startsWith('/') ? value : value.split(path.sep).join('/');
  return inventory.records.filter((record) => record.entrypoint === normalized || record.route === normalized);
}
