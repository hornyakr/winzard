import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import ts from 'typescript';

import { isJsonObject, parseContractDefinitions, type JsonLiteral } from '../kernel/ast';
import { HTTP_METHODS, type HttpMethod, type RouteRuntime } from '../routing/types';
import type { DeliveryInventory, DeliveryIssue, DeliveryOutputKind, DeliveryRecord } from './types';

const SOURCE_EXTENSIONS = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/u;
const ROUTE_ENTRYPOINT = /\/(page|route)\.(?:ts|tsx|js|jsx|mjs|cjs)$/u;
const ACTION_ENTRYPOINT = /(?:^|\/)\w[\w.-]*\.actions?\.(?:ts|tsx|js|jsx|mjs|cjs)$/u;
const TEST_FILE = /\.(?:test|spec|smoke)\.(?:ts|tsx|js|jsx)$/u;
const IGNORED_DIRECTORIES = new Set(['.git', '.next', 'generated', 'node_modules']);

function projectPath(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join('/');
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function collect(directory: string): Promise<readonly string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const output: string[] = [];
  for (const entry of entries) {
    if (IGNORED_DIRECTORIES.has(entry.name)) continue;
    const current = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await collect(current));
    else if (entry.isFile()) output.push(current);
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
    if (!isExported(statement)) continue;
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name &&
      HTTP_METHODS.includes(statement.name.text as HttpMethod)
    ) {
      result.add(statement.name.text as HttpMethod);
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (
          ts.isIdentifier(declaration.name) &&
          HTTP_METHODS.includes(declaration.name.text as HttpMethod)
        ) {
          result.add(declaration.name.text as HttpMethod);
        }
      }
    }
  }
  return Object.freeze(HTTP_METHODS.filter((method) => result.has(method)));
}

function exportedAsyncFunctions(sourceFile: ts.SourceFile): readonly string[] {
  const output: string[] = [];
  for (const statement of sourceFile.statements) {
    if (!isExported(statement)) continue;
    if (ts.isFunctionDeclaration(statement) && statement.name && isAsync(statement)) {
      output.push(statement.name.text);
    }
  }
  return Object.freeze(output.sort());
}

function runtime(source: string): RouteRuntime {
  const match = source.match(/export\s+const\s+runtime\s*=\s*['"](nodejs|edge)['"]/u);
  return match?.[1] === 'nodejs' || match?.[1] === 'edge' ? match[1] : 'unknown';
}

function names(source: string, pattern: RegExp): readonly string[] {
  const values = new Set<string>();
  for (const match of source.matchAll(pattern)) if (match[1]) values.add(match[1]);
  return Object.freeze([...values].sort());
}

function outputKinds(source: string, kind: DeliveryRecord['kind']): readonly DeliveryOutputKind[] {
  const output = new Set<DeliveryOutputKind>();
  if (kind === 'page') output.add('react-ui');
  if (kind === 'route-handler' || /\b(?:Response|NextResponse)\b/u.test(source)) output.add('response');
  if (kind === 'server-action') output.add('action-state');
  if (/\bredirect\s*\(/u.test(source)) output.add('redirect');
  if (/\bnotFound\s*\(/u.test(source)) output.add('not-found');
  if (/\bReadableStream\b|text\/event-stream/u.test(source)) output.add('stream');
  return Object.freeze([...output].sort());
}

function cachePolicy(source: string): string | null {
  if (/no-store/u.test(source)) return 'no-store';
  const match = source.match(/['"]Cache-Control['"]\s*:\s*['"]([^'"]+)['"]/u);
  return match?.[1] ?? null;
}

function issue(code: string, file: string, message: string): DeliveryIssue {
  return Object.freeze({ severity: 'error', code, file, message });
}

function objectValue(
  value: Readonly<Record<string, JsonLiteral>>,
  key: string,
): Readonly<Record<string, JsonLiteral>> | null {
  const item = value[key];
  return isJsonObject(item) ? item : null;
}

function stringValue(
  value: Readonly<Record<string, JsonLiteral>>,
  key: string,
): string | null {
  return typeof value[key] === 'string' && value[key] !== '' ? value[key] as string : null;
}

function stringMapValues(
  value: Readonly<Record<string, JsonLiteral>>,
  key: string,
): readonly string[] {
  const item = objectValue(value, key);
  if (!item) return [];
  return Object.freeze(Object.values(item).filter((entry): entry is string => typeof entry === 'string'));
}

function formattedPolicy(
  value: Readonly<Record<string, JsonLiteral>>,
  key: string,
): string | null {
  const direct = stringValue(value, key);
  if (direct) return direct;
  const map = objectValue(value, key);
  if (!map) return null;
  const entries = Object.entries(map).filter((entry): entry is [string, string] => typeof entry[1] === 'string');
  return entries.length > 0
    ? entries.sort(([left], [right]) => left.localeCompare(right)).map(([method, policy]) => `${method}:${policy}`).join(',')
    : null;
}

function adjacentContractFile(entrypoint: string): string {
  const directory = path.dirname(entrypoint);
  const name = path.basename(entrypoint);
  if (/^page\./u.test(name)) return path.join(directory, 'page.contract.ts');
  if (/^route\./u.test(name)) return path.join(directory, 'route.contract.ts');
  return path.join(directory, `${name.replace(/\.(?:ts|tsx|js|jsx|mjs|cjs)$/u, '')}.contract.ts`);
}

type ContractMetadata = Readonly<{
  id: string | null;
  file: string | null;
  requestContext: string | null;
  authentication: string | null;
  tenant: string | null;
  authorizationPolicy: string | null;
  responsePolicy: string | null;
  csrf: string | null;
  idempotency: string | null;
  bodyLimitBytes: number | null;
  operations: readonly string[];
  presenters: readonly string[];
  cache: string | null;
}>;

async function contractMetadata(root: string, entrypoint: string): Promise<ContractMetadata> {
  const absoluteEntrypoint = path.join(root, entrypoint);
  const absoluteContract = adjacentContractFile(absoluteEntrypoint);
  if (!await exists(absoluteContract)) {
    return {
      id: null,
      file: null,
      requestContext: null,
      authentication: null,
      tenant: null,
      authorizationPolicy: null,
      responsePolicy: null,
      csrf: null,
      idempotency: null,
      bodyLimitBytes: null,
      operations: [],
      presenters: [],
      cache: null,
    };
  }
  const projectFile = projectPath(root, absoluteContract);
  const definitions = parseContractDefinitions(projectFile, await readFile(absoluteContract, 'utf8'));
  const definition = definitions[0];
  if (!definition) {
    return {
      id: null,
      file: projectFile,
      requestContext: null,
      authentication: null,
      tenant: null,
      authorizationPolicy: null,
      responsePolicy: null,
      csrf: null,
      idempotency: null,
      bodyLimitBytes: null,
      operations: [],
      presenters: [],
      cache: null,
    };
  }
  const value = definition.value;
  const operations = [stringValue(value, 'operation'), ...stringMapValues(value, 'operations')]
    .filter((item): item is string => item !== null);
  const presenters = [stringValue(value, 'presenter'), ...stringMapValues(value, 'presenters')]
    .filter((item): item is string => item !== null);
  return Object.freeze({
    id: stringValue(value, 'id'),
    file: projectFile,
    requestContext: stringValue(value, 'requestContext'),
    authentication: stringValue(value, 'authentication'),
    tenant: stringValue(value, 'tenant'),
    authorizationPolicy: formattedPolicy(value, 'authorization'),
    responsePolicy: stringValue(value, 'responsePolicy'),
    csrf: stringValue(value, 'csrf'),
    idempotency: stringValue(value, 'idempotency'),
    bodyLimitBytes: typeof value.bodyLimitBytes === 'number' ? value.bodyLimitBytes : null,
    operations: Object.freeze([...new Set(operations)].sort()),
    presenters: Object.freeze([...new Set(presenters)].sort()),
    cache: stringValue(value, 'cache'),
  });
}

function importAliases(entrypoint: string): readonly string[] {
  const withoutExtension = entrypoint.replace(/\.(?:ts|tsx|js|jsx|mjs|cjs)$/u, '');
  return Object.freeze([
    entrypoint,
    withoutExtension,
    entrypoint.startsWith('src/') ? `@/${withoutExtension.slice(4)}` : withoutExtension,
  ]);
}

function relatedTests(
  testSources: ReadonlyMap<string, string>,
  record: DeliveryRecord,
): readonly string[] {
  const needles = new Set<string>(importAliases(record.entrypoint));
  if (record.route && record.route !== '/') needles.add(record.route);
  if (record.contractId) needles.add(record.contractId);
  const output: string[] = [];
  for (const [file, source] of testSources) {
    if ([...needles].some((needle) => source.includes(needle))) output.push(file);
  }
  return Object.freeze(output.sort());
}

function inspectIssues(record: DeliveryRecord, source: string): readonly DeliveryIssue[] {
  const failures: DeliveryIssue[] = [];
  const file = record.entrypoint;
  if (/\bprocess\.env\b/u.test(source)) failures.push(issue('DELIVERY_PROCESS_ENV_ACCESS', file, 'A delivery entrypoint közvetlen process.env hozzáférést használ.'));
  if (/\bredirect\s*\(\s*(?:request\.|formData\.|searchParams|params)/u.test(source)) failures.push(issue('DELIVERY_UNSAFE_REDIRECT', file, 'A redirect célja közvetlenül bizalmatlan inputból származik.'));
  if (/Response\.json\s*\([^)]*(?:error\.issues|String\s*\(\s*error\s*\)|error\.message)/su.test(source)) failures.push(issue('DELIVERY_RAW_ERROR_RESPONSE', file, 'A válasz nyers belső hibaobjektumot vagy exceptionüzenetet publikál.'));
  if (
    record.kind === 'route-handler' &&
    /request\.(?:json|formData|text|arrayBuffer)\s*\(/u.test(source) &&
    !/\b(?:safeParse|\.parse)\s*\(/u.test(source)
  ) failures.push(issue('DELIVERY_UNVALIDATED_BODY', file, 'A request body schema-validáció nélkül kerül felhasználásra.'));
  if (/Response\.json\s*\(\s*(?:domain\w*|new\s+[A-Z]\w*)/u.test(source)) failures.push(issue('DELIVERY_DOMAIN_ENTITY_RESPONSE', file, 'A delivery réteg domain objektumot ad vissza explicit presenter nélkül.'));
  if (record.methods.length === 1 && record.methods.includes('GET') && /\.commands\.|\.(?:save|delete|update|create|approve)\.execute\s*\(/u.test(source)) failures.push(issue('DELIVERY_GET_MUTATION', file, 'A GET entrypoint állapotváltoztató műveletet hív.'));
  if (/\btenantId\s*:\s*(?:body|parsed\.data|formData|request)/u.test(source)) failures.push(issue('DELIVERY_UNSCOPED_TENANT_INPUT', file, 'A tenant scope bizalmatlan request inputból származik.'));
  if (record.kind === 'page' && /\b(?:cookies|headers)\s*\(\)[\s\S]*\.set\s*\(/u.test(source)) failures.push(issue('DELIVERY_SESSION_WRITE_DURING_RENDER', file, 'A Page renderelés közben session/cookie írást végez.'));
  const stream = source.search(/\bReadableStream\b|text\/event-stream/u);
  const auth = source.search(/\b(?:requireActor|getActor|authorize|can[A-Z]\w*|create\w*RequestContext|withRouteLifecycle)\s*\(/u);
  if (stream >= 0 && (auth < 0 || stream < auth)) failures.push(issue('DELIVERY_STREAM_BEFORE_AUTH', file, 'A stream létrehozása authentikáció/authorizáció előtt történik.'));
  if (record.kind === 'server-action') {
    const sourceFile = parse(file, source);
    const invalid = sourceFile.statements.some((statement) => {
      if (!isExported(statement)) return false;
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
  const metadata = await contractMetadata(root, projectFile);
  const detectedOperations = names(
    source,
    /\b([\w.]+\.(?:queries|commands)\.\w+)\.execute\s*\(/gu,
  );
  const operations = Object.freeze(
    (metadata.operations.length > 0 ? metadata.operations : detectedOperations).slice().sort(),
  );
  const detectedPresenters = names(source, /\b((?:present|to)[A-Z]\w*)\s*\(/gu)
    .filter((name) => name !== 'toApplicationContext');
  const presenters = Object.freeze(
    (metadata.presenters.length > 0 ? metadata.presenters : detectedPresenters).slice().sort(),
  );
  const methods: readonly HttpMethod[] = kind === 'page'
    ? ['GET']
    : kind === 'route-handler'
      ? exportedMethods(sourceFile)
      : [];
  return Object.freeze({
    kind,
    entrypoint: projectFile,
    route: kind === 'server-action' ? null : routeFromEntrypoint(appRoot, file),
    methods,
    runtime: runtime(source),
    exportedActions: kind === 'server-action' ? exportedAsyncFunctions(sourceFile) : [],
    contractId: metadata.id,
    contractFile: metadata.file,
    requestContext: metadata.requestContext,
    authentication: metadata.authentication,
    tenant: metadata.tenant,
    authorizationPolicy: metadata.authorizationPolicy,
    responsePolicy: metadata.responsePolicy,
    csrf: metadata.csrf,
    idempotency: metadata.idempotency,
    bodyLimitBytes: metadata.bodyLimitBytes,
    inputSchemas: names(source, /\b([A-Za-z]\w*Schema)\.(?:safeParse|parse)\s*\(/gu),
    actorResolvers: names(source, /\b((?:create|build|get|require|resolve)[A-Z]\w*(?:Actor|RequestContext)|\w+ActorFromRequest)\s*\(/gu),
    authorizationCalls: names(source, /\b([\w.]+\.(?:can|authorize|assertAllowed)[A-Z]\w*)\s*\(/gu),
    applicationOperations: operations,
    presenter: presenters.length > 0 ? presenters.join(', ') : null,
    outputKinds: outputKinds(source, kind),
    cachePolicy: metadata.cache ?? cachePolicy(source),
    streaming: /\bReadableStream\b|text\/event-stream/u.test(source),
    tests: [],
  });
}

export async function buildDeliveryInventory(root = process.cwd()): Promise<DeliveryInventory> {
  const appRoot = path.join(root, 'src/app');
  const sourceRoot = path.join(root, 'src');
  if (!await exists(sourceRoot)) {
    return Object.freeze({ schemaVersion: 1, sourceRoot: 'src', records: [], issues: [] });
  }

  const allFiles = await collect(root);
  const testSources = new Map<string, string>();
  for (const file of allFiles.filter((candidate) => TEST_FILE.test(candidate))) {
    testSources.set(projectPath(root, file), await readFile(file, 'utf8'));
  }

  const records: DeliveryRecord[] = [];
  const sources = new Map<string, string>();
  for (const file of await collect(sourceRoot)) {
    if (!SOURCE_EXTENSIONS.test(file)) continue;
    const source = await readFile(file, 'utf8');
    const record = await recordFor(root, appRoot, file, source);
    if (record) {
      records.push(record);
      sources.set(record.entrypoint, source);
    }
  }

  const enriched = records.map((record) => Object.freeze({
    ...record,
    tests: relatedTests(testSources, record),
  }));
  const rank: Record<DeliveryRecord['kind'], number> = { page: 0, 'route-handler': 1, 'server-action': 2 };
  enriched.sort((left, right) =>
    rank[left.kind] - rank[right.kind] || left.entrypoint.localeCompare(right.entrypoint));
  const issues = enriched
    .flatMap((record) => inspectIssues(record, sources.get(record.entrypoint) ?? ''))
    .sort((left, right) => left.file.localeCompare(right.file) || left.code.localeCompare(right.code));
  return Object.freeze({
    schemaVersion: 1,
    sourceRoot: 'src',
    records: Object.freeze(enriched),
    issues: Object.freeze(issues),
  });
}

export function inspectDelivery(inventory: DeliveryInventory, value: string): readonly DeliveryRecord[] {
  const normalized = value.startsWith('/') ? value : value.split(path.sep).join('/');
  return Object.freeze(inventory.records.filter((record) =>
    record.entrypoint === normalized ||
    record.route === normalized ||
    record.contractId === value ||
    record.exportedActions.includes(value)));
}
