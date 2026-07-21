import { execFile as execFileCallback } from 'node:child_process';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import ts from 'typescript';

import { buildDeliveryInventory } from '../delivery/inventory';
import type { DeliveryRecord } from '../delivery/types';
import { HTTP_METHODS, type HttpMethod, type RouteRuntime } from '../routing/types';
import { isJsonObject, parseContractDefinitions, type JsonLiteral, type ParsedContractDefinition } from './ast';
import type {
  KernelContractKind,
  KernelInventory,
  KernelInventoryOptions,
  KernelIssue,
  KernelIssueArea,
  KernelRecord,
} from './types';

const execFile = promisify(execFileCallback);
const SOURCE_EXTENSIONS = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/u;
const CONTRACT_FILE = /(?:^|\/)(?:page|route|[\w.-]+\.actions)\.contract\.ts$/u;
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

function issue(
  area: KernelIssueArea,
  code: string,
  file: string,
  message: string,
  contractId?: string,
  severity: KernelIssue['severity'] = 'error',
): KernelIssue {
  return Object.freeze({
    severity,
    area,
    code,
    file,
    message,
    ...(contractId ? { contractId } : {}),
  });
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
  fallback = '',
): string {
  return typeof value[key] === 'string' ? value[key] as string : fallback;
}

function stringArray(
  value: Readonly<Record<string, JsonLiteral>>,
  key: string,
): readonly string[] {
  const item = value[key];
  if (!Array.isArray(item)) return [];
  return Object.freeze(item.filter((entry): entry is string => typeof entry === 'string'));
}

function stringMap(
  value: Readonly<Record<string, JsonLiteral>>,
  key: string,
): Readonly<Record<string, string>> {
  const item = objectValue(value, key);
  if (!item) return Object.freeze({});
  return Object.freeze(Object.fromEntries(
    Object.entries(item)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
      .sort(([left], [right]) => left.localeCompare(right)),
  ));
}

function numberValue(
  value: Readonly<Record<string, JsonLiteral>>,
  key: string,
): number | null {
  return typeof value[key] === 'number' ? value[key] as number : null;
}

function booleanValue(
  value: Readonly<Record<string, JsonLiteral>>,
  key: string,
): boolean {
  return value[key] === true;
}

function contractKind(definition: ParsedContractDefinition): KernelContractKind {
  if (definition.defineFunction === 'definePageContract') return 'page';
  if (definition.defineFunction === 'defineRouteContract') return 'route-handler';
  return 'server-action';
}

function methods(value: Readonly<Record<string, JsonLiteral>>): readonly HttpMethod[] {
  return Object.freeze(
    stringArray(value, 'methods').filter((method): method is HttpMethod =>
      HTTP_METHODS.includes(method as HttpMethod)),
  );
}

function runtime(value: Readonly<Record<string, JsonLiteral>>): RouteRuntime {
  const result = stringValue(value, 'runtime', 'unknown');
  return result === 'nodejs' || result === 'edge' ? result : 'unknown';
}

function candidateEntrypoints(contractFile: string): readonly string[] {
  const directory = path.dirname(contractFile);
  const name = path.basename(contractFile);
  if (name === 'page.contract.ts') {
    return ['page.tsx', 'page.ts', 'page.jsx', 'page.js'].map((file) => path.join(directory, file));
  }
  if (name === 'route.contract.ts') {
    return ['route.ts', 'route.tsx', 'route.js', 'route.jsx'].map((file) => path.join(directory, file));
  }
  const base = name.replace(/\.contract\.ts$/u, '');
  return [
    path.join(directory, `${base}.ts`),
    path.join(directory, `${base}.tsx`),
    path.join(directory, `${base}.js`),
    path.join(directory, `${base}.jsx`),
  ];
}

async function resolveEntrypoint(contractFile: string): Promise<string | null> {
  for (const candidate of candidateEntrypoints(contractFile)) {
    if (await exists(candidate)) return candidate;
  }
  return null;
}

function escaped(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function enforcement(
  kind: KernelContractKind,
  exportName: string,
  source: string,
  declaredMethods: readonly HttpMethod[],
  actions: readonly string[],
): readonly string[] {
  const output: string[] = [];
  const contract = escaped(exportName);
  if (kind === 'page') {
    if (new RegExp(`\\benforcePageContract\\s*\\(\\s*${contract}\\s*\\)`, 'u').test(source)) {
      output.push('enforcePageContract');
    }
  } else if (kind === 'route-handler') {
    for (const method of declaredMethods) {
      const pattern = new RegExp(
        `\\bwith(?:RouteLifecycle|HttpKernel)(?:<[^;>{}]+>)?\\s*\\(\\s*${contract}\\s*,\\s*['\"]${method}['\"]`,
        'u',
      );
      if (pattern.test(source)) output.push(`withRouteLifecycle:${method}`);
    }
  } else {
    for (const action of actions) {
      const pattern = new RegExp(
        `\\benforceServerActionContract\\s*\\(\\s*${contract}\\s*,\\s*['\"]${escaped(action)}['\"]`,
        'u',
      );
      if (pattern.test(source)) output.push(`enforceServerActionContract:${action}`);
    }
  }
  return Object.freeze(output.sort());
}

function names(source: string, pattern: RegExp): readonly string[] {
  const output = new Set<string>();
  for (const match of source.matchAll(pattern)) if (match[1]) output.add(match[1]);
  return Object.freeze([...output].sort());
}

function requestContextFactories(source: string, kind: KernelContractKind): readonly string[] {
  const output = new Set(names(
    source,
    /\b(create(?:Page|Route|Action)RequestContext|createRequestContextFromHeaders)\s*\(/gu,
  ));
  if (kind === 'route-handler' && /\bwith(?:RouteLifecycle|HttpKernel)\b/u.test(source)) {
    output.add('withRouteLifecycle');
  }
  return Object.freeze([...output].sort());
}

function afterHooks(source: string, kind: KernelContractKind): readonly string[] {
  const output = new Set(names(source, /\b(after|scheduleAfterResponse)\s*\(/gu));
  if (kind === 'route-handler' && /\bwith(?:RouteLifecycle|HttpKernel)\b/u.test(source)) {
    output.add('kernel-completion');
  }
  return Object.freeze([...output].sort());
}

function errorMappers(source: string, kind: KernelContractKind): readonly string[] {
  const output = new Set(names(
    source,
    /\b(problem|validationProblem|map[A-Za-z0-9]*Error|map[A-Za-z0-9]*Exception)\s*\(/gu,
  ));
  if (kind === 'route-handler' && /\bwith(?:RouteLifecycle|HttpKernel)\b/u.test(source)) {
    output.add('kernel-error-mapper');
  }
  return Object.freeze([...output].sort());
}

function importAliases(entrypoint: string): readonly string[] {
  if (!entrypoint.startsWith('src/')) return [];
  const withoutExtension = entrypoint.replace(/\.(?:ts|tsx|js|jsx|mjs|cjs)$/u, '');
  return Object.freeze([`@/${withoutExtension.slice('src/'.length)}`, withoutExtension]);
}

async function testsFor(
  root: string,
  testSources: ReadonlyMap<string, string>,
  input: Readonly<{
    id: string;
    route: string | null;
    entrypoint: string | null;
    exportName: string;
  }>,
): Promise<readonly string[]> {
  const needles = new Set<string>([input.id, input.exportName]);
  if (input.route && input.route !== '/') needles.add(input.route);
  if (input.entrypoint) for (const alias of importAliases(input.entrypoint)) needles.add(alias);
  const output: string[] = [];
  for (const [file, source] of testSources) {
    if ([...needles].some((needle) => source.includes(needle))) output.push(file);
  }
  return Object.freeze(output.sort());
}

function deliveryFor(
  records: readonly DeliveryRecord[],
  entrypoint: string | null,
): DeliveryRecord | null {
  return entrypoint
    ? records.find((record) => record.entrypoint === entrypoint) ?? null
    : null;
}

function hasReference(source: string, reference: string): boolean {
  const leaf = reference.split(/[.|]/u).filter(Boolean).at(-1);
  return source.includes(reference) || (leaf ? source.includes(leaf) : false);
}

async function contractRecord(
  root: string,
  absoluteContractFile: string,
  definition: ParsedContractDefinition,
  deliveryRecords: readonly DeliveryRecord[],
  testSources: ReadonlyMap<string, string>,
  instrumentationFeatures: readonly string[],
): Promise<Readonly<{ record: KernelRecord; issues: readonly KernelIssue[] }>> {
  const contractFile = projectPath(root, absoluteContractFile);
  const kind = contractKind(definition);
  const value = definition.value;
  const id = stringValue(value, 'id');
  const absoluteEntrypoint = await resolveEntrypoint(absoluteContractFile);
  const entrypoint = absoluteEntrypoint ? projectPath(root, absoluteEntrypoint) : null;
  const source = absoluteEntrypoint ? await readFile(absoluteEntrypoint, 'utf8') : '';
  const declaredMethods = methods(value);
  const actions = stringArray(value, 'actions');
  const route = kind === 'server-action' ? null : stringValue(value, 'route') || null;
  const authorization = kind === 'route-handler'
    ? stringMap(value, 'authorization')
    : Object.freeze({ default: stringValue(value, 'authorization') });
  const operations = kind === 'route-handler'
    ? stringMap(value, 'operations')
    : Object.freeze({ default: stringValue(value, 'operation') });
  const presenters = kind === 'route-handler'
    ? stringMap(value, 'presenters')
    : Object.freeze({ default: stringValue(value, 'presenter') });
  const responseSchemas = kind === 'route-handler'
    ? stringMap(value, 'responseSchemas')
    : Object.freeze({});
  const enforced = enforcement(kind, definition.exportName, source, declaredMethods, actions);
  const contextFactories = requestContextFactories(source, kind);
  const delivery = deliveryFor(deliveryRecords, entrypoint);
  const record: KernelRecord = Object.freeze({
    kind,
    id,
    contractFile,
    contractExport: definition.exportName,
    entrypoint,
    route,
    methods: declaredMethods,
    actions,
    runtime: runtime(value),
    requestContext: stringValue(value, 'requestContext', 'none'),
    authentication: stringValue(value, 'authentication', 'public'),
    tenant: stringValue(value, 'tenant', 'none'),
    authorization,
    cache: stringValue(value, 'cache') || null,
    responsePolicy: stringValue(value, 'responsePolicy') || null,
    csrf: stringValue(value, 'csrf') || null,
    idempotency: stringValue(value, 'idempotency') || null,
    rateLimit: stringValue(value, 'rateLimit') || null,
    bodyLimitBytes: numberValue(value, 'bodyLimitBytes'),
    streaming: booleanValue(value, 'streaming'),
    operations,
    presenters,
    responseSchemas,
    errors: stringArray(value, 'errors'),
    revalidation: stringArray(value, 'revalidation'),
    enforcement: enforced,
    requestContextFactories: contextFactories,
    afterHooks: afterHooks(source, kind),
    errorMappers: errorMappers(source, kind),
    instrumentation: instrumentationFeatures,
    tests: await testsFor(root, testSources, {
      id,
      route,
      entrypoint,
      exportName: definition.exportName,
    }),
  });

  const issues: KernelIssue[] = [];
  if (!id) {
    issues.push(issue('contract', 'KERNEL_CONTRACT_INVALID', contractFile, 'A contract id mezője hiányzik.'));
  }
  if (!entrypoint) {
    issues.push(issue(
      'contract',
      'KERNEL_ROUTE_CONTRACT_ORPHAN',
      contractFile,
      'Az adjacent delivery contract mellett nem található entrypoint.',
      id || undefined,
    ));
  } else {
    if (!source.includes(definition.exportName)) {
      issues.push(issue(
        'contract',
        'KERNEL_ROUTE_CONTRACT_UNUSED',
        entrypoint,
        `Az entrypoint nem használja a contract exportot: ${definition.exportName}.`,
        id || undefined,
      ));
    }
    const expectedEnforcement = kind === 'page'
      ? 1
      : kind === 'route-handler'
        ? declaredMethods.length
        : actions.length;
    if (enforced.length < expectedEnforcement) {
      issues.push(issue(
        'contract',
        'KERNEL_ROUTE_CONTRACT_UNENFORCED',
        entrypoint,
        'A delivery contract nincs minden deklarált entrypointra explicit módon érvényesítve.',
        id || undefined,
      ));
    }
    if (record.requestContext === 'required' && contextFactories.length === 0) {
      issues.push(issue(
        'request-context',
        'KERNEL_REQUEST_CONTEXT_MISSING',
        entrypoint,
        'A contract kötelező request-contextet deklarál, de az entrypoint nem képez vagy nem kap contextet.',
        id || undefined,
      ));
    }
    if (kind === 'route-handler' && !/\bwith(?:RouteLifecycle|HttpKernel)\b/u.test(source)) {
      issues.push(issue(
        'response-policy',
        'KERNEL_UNMAPPED_EXCEPTION',
        entrypoint,
        'A Route Handler nem használja a központi lifecycle/error mapping wrappert.',
        id || undefined,
      ));
      issues.push(issue(
        'response-policy',
        'KERNEL_RESPONSE_POLICY_MISSING',
        entrypoint,
        'A Route Handler nem használja a contract response-policyját.',
        id || undefined,
      ));
    }
    for (const operation of Object.values(operations).filter(Boolean)) {
      if (!hasReference(source, operation)) {
        issues.push(issue(
          'contract',
          'KERNEL_OPERATION_UNREFERENCED',
          entrypoint,
          `A contract application operationje nem látható az entrypointban: ${operation}.`,
          id || undefined,
        ));
      }
    }
    for (const presenter of Object.values(presenters).filter(Boolean)) {
      if (!hasReference(source, presenter)) {
        issues.push(issue(
          'contract',
          'KERNEL_PRESENTER_UNREFERENCED',
          entrypoint,
          `A contract presentere nem látható az entrypointban: ${presenter}.`,
          id || undefined,
        ));
      }
    }
  }

  if (delivery) {
    if (record.route && delivery.route !== record.route) {
      issues.push(issue(
        'contract',
        'KERNEL_CONTRACT_ROUTE_MISMATCH',
        contractFile,
        `Contract route (${record.route}) és filesystem route (${delivery.route ?? '-'}) eltér.`,
        id || undefined,
      ));
    }
    if (kind !== 'server-action') {
      const actual = [...delivery.methods].sort().join(',');
      const expected = [...record.methods].sort().join(',');
      if (actual !== expected) {
        issues.push(issue(
          'contract',
          'KERNEL_CONTRACT_METHOD_MISMATCH',
          contractFile,
          `Contract method (${expected || '-'}) és exportált method (${actual || '-'}) eltér.`,
          id || undefined,
        ));
      }
    }
    if (delivery.runtime !== 'unknown' && delivery.runtime !== record.runtime) {
      issues.push(issue(
        'contract',
        'KERNEL_CONTRACT_RUNTIME_MISMATCH',
        contractFile,
        `Contract runtime (${record.runtime}) és entrypoint runtime (${delivery.runtime}) eltér.`,
        id || undefined,
      ));
    }
    if (kind === 'server-action') {
      const actual = [...delivery.exportedActions].sort().join(',');
      const expected = [...record.actions].sort().join(',');
      if (actual !== expected) {
        issues.push(issue(
          'contract',
          'KERNEL_CONTRACT_ACTION_MISMATCH',
          contractFile,
          `Contract action (${expected || '-'}) és exportált action (${actual || '-'}) eltér.`,
          id || undefined,
        ));
      }
    }
  }

  if (record.tests.length === 0) {
    issues.push(issue(
      'contract',
      'KERNEL_CONTRACT_TEST_MISSING',
      contractFile,
      'A delivery contracthoz nem található statikusan kapcsolható teszt.',
      id || undefined,
      'warning',
    ));
  }

  return { record, issues };
}

function scriptKind(file: string): ts.ScriptKind {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (file.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (/\.(?:js|mjs|cjs)$/u.test(file)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function topLevelMutableState(file: string, source: string): readonly string[] {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind(file));
  const output: string[] = [];
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    const mutable = (statement.declarationList.flags & ts.NodeFlags.Const) === 0;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name)) continue;
      const name = declaration.name.text;
      if (mutable && /(?:actor|current|headers|locale|request|response|tenant|user)/iu.test(name)) {
        output.push(name);
      }
      if (
        !mutable &&
        declaration.initializer &&
        ts.isNewExpression(declaration.initializer) &&
        ts.isIdentifier(declaration.initializer.expression) &&
        ['Map', 'Set', 'WeakMap', 'WeakSet'].includes(declaration.initializer.expression.text) &&
        /(?:actor|cache|current|locale|request|tenant|user)/iu.test(name)
      ) {
        output.push(name);
      }
    }
  }
  return Object.freeze(output.sort());
}

function applicationTypeReferences(file: string, source: string): readonly string[] {
  if (!file.includes('/application/') && !file.startsWith('src/application/')) return [];
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind(file));
  const output = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) {
      if (node.typeName.text === 'Request' || node.typeName.text === 'Response' || node.typeName.text === 'Headers') {
        output.add(node.typeName.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return Object.freeze([...output].sort());
}

function inspectSource(file: string, source: string): readonly KernelIssue[] {
  const issues: KernelIssue[] = [];
  for (const name of topLevelMutableState(file, source)) {
    issues.push(issue(
      'request-context',
      name.toLowerCase().includes('cache') ? 'KERNEL_CROSS_REQUEST_CACHE' : 'KERNEL_MUTABLE_REQUEST_GLOBAL',
      file,
      `Request- vagy user-specifikus mutable module state: ${name}.`,
    ));
  }

  if (/\b(?:new\s+EventEmitter|EventEmitter\s*\()/u.test(source) && /(?:http|kernel|delivery)/iu.test(file)) {
    issues.push(issue(
      'architecture',
      'KERNEL_GLOBAL_EVENT_DISPATCHER',
      file,
      'A HTTP lifecycle nem használhat globális EventEmitter/EventDispatcher hálót.',
    ));
  }
  if (
    file !== 'src/proxy.ts' &&
    /['"](?:forwarded|x-forwarded-for|x-forwarded-host|x-forwarded-proto|x-real-ip)['"]/iu.test(source)
  ) {
    issues.push(issue(
      'request-context',
      'KERNEL_UNTRUSTED_FORWARDED_HEADER',
      file,
      'A runtime kód közvetlen forwarded headert olvas a megbízható Proxy-adapter helyett.',
    ));
  }
  if (/\bfetch\s*\(\s*['"](?:\/api(?:\/|['"])|https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/api)/iu.test(source)) {
    issues.push(issue(
      'architecture',
      'KERNEL_INTERNAL_HTTP_SUBREQUEST',
      file,
      'A moduláris monolit saját HTTP API-t hív közvetlen application kompozíció helyett.',
    ));
  }
  if (
    /from\s+['"]node:fs(?:\/promises)?['"]/u.test(source) &&
    /\b(?:glob|opendir|readdir)\s*\(/u.test(source)
  ) {
    issues.push(issue(
      'architecture',
      'KERNEL_DYNAMIC_RESOURCE_SCAN',
      file,
      'A request-time runtime kód dinamikus filesystem resource scant használ.',
    ));
  }

  if (file.includes('/application/') || file.startsWith('src/application/')) {
    if (/from\s+['"]next(?:\/[^'"]*)?['"]/u.test(source)) {
      issues.push(issue(
        'architecture',
        'KERNEL_APPLICATION_NEXT_IMPORT',
        file,
        'Az application réteg Next.js importot használ.',
      ));
    }
    if (/from\s+['"]next\/(?:headers|cookies)['"]/u.test(source) || /\b(?:cookies|headers)\s*\(/u.test(source)) {
      issues.push(issue(
        'architecture',
        'KERNEL_APPLICATION_COOKIE_IMPORT',
        file,
        'Az application réteg cookie/header request API-t használ.',
      ));
    }
    const types = applicationTypeReferences(file, source);
    if (types.length > 0) {
      issues.push(issue(
        'architecture',
        'KERNEL_APPLICATION_REQUEST_IMPORT',
        file,
        `Az application réteg Web request/response típust használ: ${types.join(', ')}.`,
      ));
    }
  }

  if (/Response\.json\s*\(\s*(?:await\s+)?[\w.]+\.(?:queries|commands)\.[\w.]+\.execute\s*\(/su.test(source)) {
    issues.push(issue(
      'response-policy',
      'KERNEL_RAW_DOMAIN_RESPONSE',
      file,
      'A delivery adapter application eredményt ad vissza explicit presenter nélkül.',
    ));
  }
  if (/Response\.json\s*\([^)]*(?:error\.issues|error\.message|String\s*\(\s*error\s*\))/su.test(source)) {
    issues.push(issue(
      'response-policy',
      'KERNEL_RAW_EXCEPTION_RESPONSE',
      file,
      'A response nyers exceptionrészletet publikál.',
    ));
  }

  const deliveryEntrypoint = file.startsWith('src/app/') || /\.actions?\.(?:ts|tsx|js|jsx|mjs|cjs)$/u.test(file);
  const stream = deliveryEntrypoint
    ? source.search(/\bnew\s+ReadableStream\b|text\/event-stream/u)
    : -1;
  const authentication = source.search(/\b(?:authenticate|create\w*RequestContext|requireActor|withRouteLifecycle)\b/u);
  if (stream >= 0 && (authentication < 0 || stream < authentication)) {
    issues.push(issue(
      'response-policy',
      'KERNEL_STREAM_BEFORE_AUTH',
      file,
      'A stream létrehozása authentication/request-context feloldás előtt történik.',
    ));
  }
  if (stream >= 0) {
    const mutation = source.search(/\.headers\.(?:append|delete|set)\s*\(|headers\.set\s*\(/u);
    if (mutation > stream) {
      issues.push(issue(
        'response-policy',
        'KERNEL_RESPONSE_MUTATION_AFTER_STREAM',
        file,
        'A kód stream létrehozása után módosít response headert.',
      ));
    }
  }

  if (
    /\b(?:after|scheduleAfterResponse)\s*\(/u.test(source) &&
    /\b(?:mailer|sendEmail|payment|charge|inventory|outbox|repository\.(?:save|update)|webhook|queue\.(?:add|send))\b/iu.test(source)
  ) {
    issues.push(issue(
      'instrumentation',
      'KERNEL_AFTER_DURABLE_SIDE_EFFECT',
      file,
      'Az after-response callback tartós vagy üzletileg kötelező side effectet tartalmaz.',
    ));
  }
  if (
    /\b(?:after|scheduleAfterResponse)\s*\(/u.test(source) &&
    /\b(?:assumeSuccess|successfulRequest|result\.kind\s*===\s*['"]success['"])\b/u.test(source) &&
    !/\b(?:status|outcome)\b/u.test(source)
  ) {
    issues.push(issue(
      'instrumentation',
      'KERNEL_AFTER_ASSUMES_SUCCESS',
      file,
      'Az after-response callback a lifecycle eredményének explicit státusza nélkül feltételez sikert.',
    ));
  }
  if (/\.getReader\s*\(\s*\)/u.test(source) && !/\bfinally\b[\s\S]*\.releaseLock\s*\(/u.test(source)) {
    issues.push(issue(
      'request-context',
      'KERNEL_MISSING_ABORT_CLEANUP',
      file,
      'A request/stream readerből hiányzik a finally alapú release cleanup.',
    ));
  }
  if (/\bnew\s+ReadableStream\b/u.test(source) && !/\bcancel\s*\(/u.test(source)) {
    issues.push(issue(
      'request-context',
      'KERNEL_MISSING_ABORT_CLEANUP',
      file,
      'A streamből hiányzik a cancel/cleanup contract.',
    ));
  }
  if (
    /\b(?:metric|metrics|telemetry)\b/iu.test(source) &&
    /\b(?:observe|increment|record)\s*\([^)]*(?:request\.url|nextUrl\.pathname|request\.path)/su.test(source)
  ) {
    issues.push(issue(
      'instrumentation',
      'KERNEL_HIGH_CARDINALITY_ROUTE_METRIC',
      file,
      'A metric raw request pathot használ route pattern helyett.',
    ));
  }

  return issues;
}

async function instrumentationFeatures(root: string): Promise<Readonly<{ features: readonly string[]; issues: readonly KernelIssue[] }>> {
  const candidates = ['instrumentation.ts', 'instrumentation.js', 'src/instrumentation.ts', 'src/instrumentation.js'];
  const selected = (await Promise.all(candidates.map(async (file) => ({ file, exists: await exists(path.join(root, file)) }))))
    .find(({ exists: present }) => present);
  if (!selected) {
    return {
      features: [],
      issues: [issue(
        'instrumentation',
        'KERNEL_INSTRUMENTATION_MISSING',
        'instrumentation.ts',
        'A HTTP-kernel capabilityből hiányzik az instrumentation entrypoint.',
      )],
    };
  }

  const source = await readFile(path.join(root, selected.file), 'utf8');
  const features: string[] = [];
  if (/export\s+(?:async\s+)?function\s+register\b/u.test(source)) features.push('register');
  if (/export\s+(?:(?:async\s+)?function\s+onRequestError\b|const\s+onRequestError\b)/u.test(source)) features.push('onRequestError');
  const issues: KernelIssue[] = [];
  if (!features.includes('register')) {
    issues.push(issue(
      'instrumentation',
      'KERNEL_INSTRUMENTATION_REGISTER_MISSING',
      selected.file,
      'Az instrumentation entrypointból hiányzik a register hook.',
    ));
  }
  if (!features.includes('onRequestError')) {
    issues.push(issue(
      'instrumentation',
      'KERNEL_INSTRUMENTATION_ERROR_HOOK_MISSING',
      selected.file,
      'Az instrumentation entrypointból hiányzik az onRequestError hook.',
    ));
  }
  if (/JSON\.stringify\s*\(\s*request\.headers|Object\.values\s*\(\s*request\.headers/u.test(source)) {
    issues.push(issue(
      'instrumentation',
      'KERNEL_INSTRUMENTATION_HEADER_VALUE_LEAK',
      selected.file,
      'Az instrumentation nyers request headerértékeket jelenthet.',
    ));
  }
  return { features: Object.freeze(features.sort()), issues };
}


async function proxyIssues(root: string): Promise<readonly KernelIssue[]> {
  const candidates = ['src/proxy.ts', 'src/proxy.js', 'proxy.ts', 'proxy.js'];
  const selected = (await Promise.all(candidates.map(async (file) => ({
    file,
    present: await exists(path.join(root, file)),
  })))).find(({ present }) => present);
  if (!selected) {
    return [issue(
      'request-context',
      'KERNEL_PROXY_REQUEST_ID_MISSING',
      'src/proxy.ts',
      'A HTTP-kernel capabilityből hiányzik a Proxy request-ID és internal-header bridge.',
    )];
  }

  const source = await readFile(path.join(root, selected.file), 'utf8');
  const issues: KernelIssue[] = [];
  const deletesInternalHeaders = /INTERNAL_REQUEST_HEADERS[\s\S]{0,240}\.delete\s*\(/u.test(source) ||
    /(?:x-winzard-[a-z-]+)[\s\S]{0,120}\.delete\s*\(/iu.test(source);
  if (!deletesInternalHeaders) {
    issues.push(issue(
      'request-context',
      'KERNEL_PROXY_INTERNAL_HEADER_SPOOFING',
      selected.file,
      'A Proxy nem törli explicit módon a kliens által küldhető belső x-winzard-* headereket.',
    ));
  }
  if (!/\.set\s*\(\s*INTERNAL_REQUEST_ID_HEADER\b/u.test(source)) {
    issues.push(issue(
      'request-context',
      'KERNEL_PROXY_REQUEST_ID_MISSING',
      selected.file,
      'A Proxy nem képez és nem továbbít belső request ID-t.',
    ));
  }
  if (/\b(?:authorize|assertAllowed|requireActor|can[A-Z]\w*)\s*\(/u.test(source)) {
    issues.push(issue(
      'request-context',
      'KERNEL_PROXY_ONLY_AUTHORIZATION',
      selected.file,
      'A Proxy erőforrás- vagy üzleti authorizációt próbál birtokolni; az érdemi entrypoint/application policyban ismételt ellenőrzés szükséges.',
    ));
  }
  return Object.freeze(issues);
}

async function customServerIssues(root: string, files: readonly string[]): Promise<readonly KernelIssue[]> {
  const issues: KernelIssue[] = [];
  const adrDirectory = path.join(root, 'docs/adr');
  const adrSources = (await collect(adrDirectory))
    .filter((file) => file.endsWith('.md'));
  const acceptedAdr = (await Promise.all(adrSources.map(async (file) => readFile(file, 'utf8'))))
    .some((source) => /custom server/iu.test(source) && /(?:accepted|elfogadott)/iu.test(source));

  for (const absolute of files) {
    const file = projectPath(root, absolute);
    if (!/(?:^|\/)(?:custom-)?server\.(?:ts|js|mjs|cjs)$/u.test(file)) continue;
    const source = await readFile(absolute, 'utf8');
    if (/\bcreateServer\s*\(|from\s+['"]node:http['"]|require\s*\(\s*['"]http['"]\s*\)/u.test(source)) {
      issues.push(issue(
        'architecture',
        'KERNEL_SECOND_RUNTIME_ROUTER',
        file,
        'A repository második HTTP server/router runtime-ot hoz létre a Next.js mellett.',
      ));
      if (!acceptedAdr) {
        issues.push(issue(
          'architecture',
          'KERNEL_CUSTOM_SERVER_UNJUSTIFIED',
          file,
          'A custom serverhez nem található elfogadott ADR.',
        ));
      }
    }
  }
  return issues;
}

async function changedFiles(root: string, changedFrom: string | undefined): Promise<readonly string[]> {
  if (!changedFrom) return [];
  const [{ stdout: repositoryRootOutput }, { stdout }] = await Promise.all([
    execFile('git', ['rev-parse', '--show-toplevel'], { cwd: root }),
    execFile(
      'git',
      ['diff', '--name-only', `${changedFrom}...HEAD`],
      { cwd: root, maxBuffer: 4 * 1024 * 1024 },
    ),
  ]);
  const repositoryRoot = repositoryRootOutput.trim();
  const projectPrefix = path.relative(repositoryRoot, root).split(path.sep).join('/');
  const prefix = projectPrefix ? `${projectPrefix}/` : '';
  const files = stdout
    .split(/\r?\n/u)
    .map((file) => file.trim())
    .filter(Boolean)
    .map((file) => prefix && file.startsWith(prefix) ? file.slice(prefix.length) : file)
    .sort();
  return Object.freeze(files);
}

function impactedByChanges(
  record: KernelRecord,
  changed: ReadonlySet<string>,
  kernelCoreChanged: boolean,
): boolean {
  if (kernelCoreChanged) return true;
  return changed.has(record.contractFile) ||
    (record.entrypoint !== null && changed.has(record.entrypoint)) ||
    record.tests.some((file) => changed.has(file));
}

function sortIssues(issues: readonly KernelIssue[]): readonly KernelIssue[] {
  return Object.freeze([...issues].sort((left, right) =>
    left.file.localeCompare(right.file) ||
    left.code.localeCompare(right.code) ||
    (left.contractId ?? '').localeCompare(right.contractId ?? '')));
}

export async function buildKernelInventory(
  root = process.cwd(),
  options: KernelInventoryOptions = {},
): Promise<KernelInventory> {
  const sourceRoot = path.join(root, 'src');
  const allProjectFiles = await collect(root);
  const sourceFiles = allProjectFiles.filter((file) =>
    projectPath(root, file).startsWith('src/') && SOURCE_EXTENSIONS.test(file));
  const contractFiles = sourceFiles.filter((file) => CONTRACT_FILE.test(projectPath(root, file)));
  const testFiles = allProjectFiles.filter((file) => TEST_FILE.test(file));
  const testSources = new Map<string, string>();
  for (const file of testFiles) testSources.set(projectPath(root, file), await readFile(file, 'utf8'));

  const delivery = await buildDeliveryInventory(root);
  const instrumentation = await instrumentationFeatures(root);
  const records: KernelRecord[] = [];
  const issues: KernelIssue[] = [...instrumentation.issues];

  for (const absoluteContractFile of contractFiles) {
    const file = projectPath(root, absoluteContractFile);
    const source = await readFile(absoluteContractFile, 'utf8');
    let definitions: readonly ParsedContractDefinition[];
    try {
      definitions = parseContractDefinitions(file, source);
    } catch (error) {
      issues.push(issue(
        'contract',
        'KERNEL_CONTRACT_INVALID',
        file,
        error instanceof Error ? error.message : String(error),
      ));
      continue;
    }
    if (definitions.length === 0) {
      issues.push(issue(
        'contract',
        'KERNEL_CONTRACT_INVALID',
        file,
        'A contract fájl nem exportál támogatott define*Contract hívást.',
      ));
      continue;
    }
    if (definitions.length > 1) {
      issues.push(issue(
        'contract',
        'KERNEL_CONTRACT_MULTIPLE',
        file,
        'Egy adjacent contract fájl pontosan egy delivery contractot exportáljon.',
      ));
    }
    for (const definition of definitions) {
      const result = await contractRecord(
        root,
        absoluteContractFile,
        definition,
        delivery.records,
        testSources,
        instrumentation.features,
      );
      records.push(result.record);
      issues.push(...result.issues);
    }
  }

  const contractEntrypoints = new Set(records.map(({ entrypoint }) => entrypoint).filter(Boolean));
  for (const record of delivery.records) {
    if (!contractEntrypoints.has(record.entrypoint)) {
      issues.push(issue(
        'contract',
        'KERNEL_ROUTE_CONTRACT_MISSING',
        record.entrypoint,
        'A delivery entrypoint mellett nem található adjacent typed contract.',
      ));
    }
  }

  const ids = new Map<string, string[]>();
  for (const record of records) {
    const files = ids.get(record.id) ?? [];
    files.push(record.contractFile);
    ids.set(record.id, files);
  }
  for (const [id, files] of ids) {
    if (id && files.length > 1) {
      for (const file of files) {
        issues.push(issue(
          'contract',
          'KERNEL_CONTRACT_ID_DUPLICATE',
          file,
          `Duplikált kernel contract ID: ${id}.`,
          id,
        ));
      }
    }
  }

  for (const absolute of sourceFiles) {
    issues.push(...inspectSource(projectPath(root, absolute), await readFile(absolute, 'utf8')));
  }
  issues.push(...await proxyIssues(root));
  issues.push(...await customServerIssues(root, allProjectFiles));

  const isolationEvidence = [...testSources.values()].some((source) =>
    /multi-request isolation|cross-request isolation|KERNEL_REQUEST_CONTEXT_LEAK/iu.test(source));
  if (!isolationEvidence) {
    issues.push(issue(
      'request-context',
      'KERNEL_REQUEST_CONTEXT_LEAK',
      'tests',
      'Nem található multi-request/cross-request isolation evidence.',
    ));
  }

  const contextFilePresent = await exists(path.join(sourceRoot, 'platform/http/request-context.server.ts')) ||
    await exists(path.join(sourceRoot, 'platform/http/request-context.ts'));
  if (!contextFilePresent) {
    issues.push(issue(
      'request-context',
      'KERNEL_REQUEST_CONTEXT_MISSING',
      'src/platform/http/request-context.server.ts',
      'A HTTP-kernel capabilityből hiányzik a request-context platform contract.',
    ));
  }
  if (!await exists(path.join(sourceRoot, 'platform/http/response-policy.ts'))) {
    issues.push(issue(
      'response-policy',
      'KERNEL_RESPONSE_POLICY_MISSING',
      'src/platform/http/response-policy.ts',
      'A HTTP-kernel capabilityből hiányzik a központi response-policy.',
    ));
  }

  records.sort((left, right) => left.id.localeCompare(right.id));
  const changed = await changedFiles(root, options.changedFrom);
  if (!options.changedFrom) {
    return Object.freeze({
      schemaVersion: 1,
      sourceRoot: 'src',
      changedFrom: null,
      changedFiles: [],
      records: Object.freeze(records),
      issues: sortIssues(issues),
    });
  }

  const changedSet = new Set(changed);
  const kernelCoreChanged = changed.some((file) =>
    file.startsWith('src/platform/http/') ||
    file === 'src/proxy.ts' ||
    file === 'instrumentation.ts' ||
    file.startsWith('packages/forge/src/kernel/'));
  const selectedRecords = records.filter((record) => impactedByChanges(record, changedSet, kernelCoreChanged));
  const selectedIds = new Set(selectedRecords.map(({ id }) => id));
  const selectedIssues = issues.filter((entry) =>
    kernelCoreChanged ||
    changedSet.has(entry.file) ||
    (entry.contractId !== undefined && selectedIds.has(entry.contractId)) ||
    entry.file === 'tests');

  return Object.freeze({
    schemaVersion: 1,
    sourceRoot: 'src',
    changedFrom: options.changedFrom,
    changedFiles: changed,
    records: Object.freeze(selectedRecords),
    issues: sortIssues(selectedIssues),
  });
}

export function inspectKernel(
  inventory: KernelInventory,
  value: string,
  method?: string,
): readonly KernelRecord[] {
  const normalized = value.startsWith('/') ? value : value.split(path.sep).join('/');
  return Object.freeze(inventory.records.filter((record) => {
    const matches = record.id === value ||
      record.contractFile === normalized ||
      record.entrypoint === normalized ||
      record.route === normalized ||
      record.actions.includes(value);
    if (!matches) return false;
    return method ? record.methods.includes(method.toUpperCase() as HttpMethod) : true;
  }));
}
