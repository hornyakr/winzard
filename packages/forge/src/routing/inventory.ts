import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import ts from 'typescript';

import {
  HTTP_METHODS,
  type DynamicSegment,
  type HttpMethod,
  type RouteAlias,
  type RouteBoundaries,
  type RouteInventory,
  type RouteRecord,
  type RouteRuntime,
  type RoutingIssue,
} from './types';

const ENTRYPOINT_PATTERN = /^(page|route)\.(?:ts|tsx|js|jsx|mjs|cjs)$/u;
const BOUNDARY_FILES = {
  layout: ['layout.tsx', 'layout.ts', 'layout.jsx', 'layout.js'],
  loading: ['loading.tsx', 'loading.ts', 'loading.jsx', 'loading.js'],
  error: ['error.tsx', 'error.ts', 'error.jsx', 'error.js'],
  notFound: ['not-found.tsx', 'not-found.ts', 'not-found.jsx', 'not-found.js'],
  defaults: ['default.tsx', 'default.ts', 'default.jsx', 'default.js'],
} as const;
const NEXT_CONFIG_FILES = ['next.config.ts', 'next.config.mts', 'next.config.mjs', 'next.config.js', 'next.config.cjs'] as const;
const INTERCEPTING_PREFIXES = ['(..)(..)', '(...)', '(..)', '(.)'] as const;

function toProjectPath(root: string, filePath: string): string {
  return path.relative(root, filePath).split(path.sep).join('/');
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function scriptKind(filePath: string): ts.ScriptKind {
  if (filePath.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (filePath.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (filePath.endsWith('.js') || filePath.endsWith('.mjs') || filePath.endsWith('.cjs')) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

async function collectEntrypoints(directory: string): Promise<readonly string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }

  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith('_') || entry.name === 'node_modules' || entry.name === '.next') continue;
      files.push(...(await collectEntrypoints(entryPath)));
      continue;
    }
    if (entry.isFile() && ENTRYPOINT_PATTERN.test(entry.name)) files.push(entryPath);
  }
  return files.sort();
}

function parseSegment(segment: string): Readonly<{
  visible: string | null;
  group: string | null;
  slot: string | null;
  intercepting: string | null;
  dynamic: DynamicSegment | null;
}> {
  if (segment.startsWith('@')) {
    return { visible: null, group: null, slot: segment.slice(1), intercepting: null, dynamic: null };
  }

  for (const prefix of INTERCEPTING_PREFIXES) {
    if (segment.startsWith(prefix) && segment.length > prefix.length) {
      const visible = segment.slice(prefix.length);
      return {
        visible,
        group: null,
        slot: null,
        intercepting: segment,
        dynamic: parseDynamicSegment(visible),
      };
    }
  }

  if (/^\([^/]+\)$/u.test(segment)) {
    return { visible: null, group: segment.slice(1, -1), slot: null, intercepting: null, dynamic: null };
  }

  return {
    visible: segment,
    group: null,
    slot: null,
    intercepting: null,
    dynamic: parseDynamicSegment(segment),
  };
}

function parseDynamicSegment(segment: string): DynamicSegment | null {
  const optionalCatchAll = segment.match(/^\[\[\.\.\.([A-Za-z0-9_]+)\]\]$/u);
  if (optionalCatchAll) return { name: optionalCatchAll[1] ?? '', kind: 'optional-catch-all' };
  const catchAll = segment.match(/^\[\.\.\.([A-Za-z0-9_]+)\]$/u);
  if (catchAll) return { name: catchAll[1] ?? '', kind: 'catch-all' };
  const dynamic = segment.match(/^\[([A-Za-z0-9_]+)\]$/u);
  if (dynamic) return { name: dynamic[1] ?? '', kind: 'dynamic' };
  return null;
}

function routeMetadata(appRoot: string, entrypoint: string): Readonly<{
  pattern: string;
  dynamicSegments: readonly DynamicSegment[];
  routeGroups: readonly string[];
  parallelSlots: readonly string[];
  interceptingSegments: readonly string[];
  owner: string;
  physicalDirectories: readonly string[];
}> {
  const relativeDirectory = path.relative(appRoot, path.dirname(entrypoint));
  const physicalSegments = relativeDirectory === '' ? [] : relativeDirectory.split(path.sep);
  const visible: string[] = [];
  const dynamicSegments: DynamicSegment[] = [];
  const routeGroups: string[] = [];
  const parallelSlots: string[] = [];
  const interceptingSegments: string[] = [];
  const physicalDirectories: string[] = [appRoot];
  let current = appRoot;

  for (const raw of physicalSegments) {
    current = path.join(current, raw);
    physicalDirectories.push(current);
    const parsed = parseSegment(raw);
    if (parsed.group) routeGroups.push(parsed.group);
    if (parsed.slot) parallelSlots.push(parsed.slot);
    if (parsed.intercepting) interceptingSegments.push(parsed.intercepting);
    if (parsed.visible) visible.push(parsed.visible);
    if (parsed.dynamic) dynamicSegments.push(parsed.dynamic);
  }

  const pattern = visible.length === 0 ? '/' : `/${visible.join('/')}`;
  const owner = visible.find((segment) => !parseDynamicSegment(segment)) ?? routeGroups[0] ?? 'root';
  return { pattern, dynamicSegments, routeGroups, parallelSlots, interceptingSegments, owner, physicalDirectories };
}

function exportedConst(sourceFile: ts.SourceFile, name: string): ts.Expression | null {
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    const exported = statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
    if (!exported) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === name) return declaration.initializer ?? null;
    }
  }
  return null;
}

function expressionText(expression: ts.Expression | null, sourceFile: ts.SourceFile): string | null {
  if (!expression) return null;
  if (ts.isStringLiteralLike(expression)) return expression.text;
  if (expression.kind === ts.SyntaxKind.TrueKeyword) return 'true';
  if (expression.kind === ts.SyntaxKind.FalseKeyword) return 'false';
  if (ts.isNumericLiteral(expression)) return expression.text;
  return expression.getText(sourceFile);
}

function booleanConst(expression: ts.Expression | null): boolean | null {
  if (!expression) return null;
  if (expression.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (expression.kind === ts.SyntaxKind.FalseKeyword) return false;
  return null;
}

function collectImports(sourceFile: ts.SourceFile): readonly string[] {
  return sourceFile.statements.flatMap((statement) => {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) return [];
    return [statement.moduleSpecifier.text];
  });
}

function collectMethods(sourceFile: ts.SourceFile): readonly HttpMethod[] {
  const methods = new Set<HttpMethod>();
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement)) {
      const exported = statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
      if (exported && statement.name && HTTP_METHODS.includes(statement.name.text as HttpMethod)) {
        methods.add(statement.name.text as HttpMethod);
      }
      continue;
    }
    if (ts.isVariableStatement(statement)) {
      const exported = statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
      if (!exported) continue;
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && HTTP_METHODS.includes(declaration.name.text as HttpMethod)) {
          methods.add(declaration.name.text as HttpMethod);
        }
      }
    }
  }
  return HTTP_METHODS.filter((method) => methods.has(method));
}

function runtimeValue(sourceFile: ts.SourceFile): RouteRuntime {
  const value = expressionText(exportedConst(sourceFile, 'runtime'), sourceFile);
  return value === 'nodejs' || value === 'edge' ? value : 'unknown';
}

async function firstExisting(root: string, candidates: readonly string[]): Promise<string | null> {
  for (const candidate of candidates) {
    const absolute = path.join(root, candidate);
    if (await exists(absolute)) return absolute;
  }
  return null;
}

async function collectBoundaries(root: string, physicalDirectories: readonly string[]): Promise<RouteBoundaries> {
  const result: Record<keyof RouteBoundaries, string[]> = {
    layouts: [],
    loading: [],
    error: [],
    notFound: [],
    defaults: [],
  };
  const mapping: ReadonlyArray<readonly [keyof RouteBoundaries, readonly string[]]> = [
    ['layouts', BOUNDARY_FILES.layout],
    ['loading', BOUNDARY_FILES.loading],
    ['error', BOUNDARY_FILES.error],
    ['notFound', BOUNDARY_FILES.notFound],
    ['defaults', BOUNDARY_FILES.defaults],
  ];

  for (const directory of physicalDirectories) {
    for (const [key, candidates] of mapping) {
      const selected = await firstExisting(directory, candidates);
      if (selected) result[key].push(toProjectPath(root, selected));
    }
  }

  return result;
}

async function routeRecord(root: string, appRoot: string, entrypoint: string): Promise<RouteRecord> {
  const source = await readFile(entrypoint, 'utf8');
  const sourceFile = ts.createSourceFile(entrypoint, source, ts.ScriptTarget.Latest, true, scriptKind(entrypoint));
  const metadata = routeMetadata(appRoot, entrypoint);
  const basename = path.basename(entrypoint);
  const kind = basename.startsWith('page.') ? 'page' : 'handler';
  const imports = collectImports(sourceFile);
  const hasInputSchema = imports.some((specifier) => /(?:^|[/.-])schemas?(?:$|[/.-])/iu.test(specifier)) || /\b[A-Za-z0-9_]+Schema\.(?:parse|safeParse)\s*\(/u.test(source);

  return {
    kind,
    pattern: metadata.pattern,
    entrypoint: toProjectPath(root, entrypoint),
    methods: kind === 'page' ? ['GET'] : collectMethods(sourceFile),
    dynamicSegments: metadata.dynamicSegments,
    routeGroups: metadata.routeGroups,
    parallelSlots: metadata.parallelSlots,
    interceptingSegments: metadata.interceptingSegments,
    runtime: runtimeValue(sourceFile),
    dynamicMode: expressionText(exportedConst(sourceFile, 'dynamic'), sourceFile),
    revalidate: expressionText(exportedConst(sourceFile, 'revalidate'), sourceFile),
    dynamicParams: booleanConst(exportedConst(sourceFile, 'dynamicParams')),
    hasInputSchema,
    owner: metadata.owner,
    boundaries: await collectBoundaries(root, metadata.physicalDirectories),
  };
}

function propertyName(node: ts.PropertyName | undefined): string | null {
  if (!node) return null;
  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) return node.text;
  return null;
}

function literalString(node: ts.Expression | undefined): string | null {
  return node && ts.isStringLiteralLike(node) ? node.text : null;
}

function literalBoolean(node: ts.Expression | undefined): boolean | null {
  if (!node) return null;
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  return null;
}

function returnedExpression(node: ts.Expression | undefined): ts.Expression | null {
  if (!node) return null;
  if (ts.isArrowFunction(node)) {
    if (!ts.isBlock(node.body)) return node.body;
    const statement = node.body.statements.find(ts.isReturnStatement);
    return statement?.expression ?? null;
  }
  if (ts.isFunctionExpression(node)) {
    const statement = node.body.statements.find(ts.isReturnStatement);
    return statement?.expression ?? null;
  }
  return null;
}

function aliasObjects(expression: ts.Expression | null): readonly ts.ObjectLiteralExpression[] {
  if (!expression) return [];
  if (ts.isArrayLiteralExpression(expression)) {
    return expression.elements.filter(ts.isObjectLiteralExpression);
  }
  if (ts.isObjectLiteralExpression(expression)) {
    return expression.properties.flatMap((property) => {
      if (!ts.isPropertyAssignment(property) || !ts.isArrayLiteralExpression(property.initializer)) return [];
      return property.initializer.elements.filter(ts.isObjectLiteralExpression);
    });
  }
  return [];
}

function parseAliasObject(
  object: ts.ObjectLiteralExpression,
  type: 'redirect' | 'rewrite',
  configFile: string,
): RouteAlias | null {
  let source: string | null = null;
  let destination: string | null = null;
  let permanent: boolean | null = null;
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const name = propertyName(property.name);
    if (name === 'source') source = literalString(property.initializer);
    if (name === 'destination') destination = literalString(property.initializer);
    if (name === 'permanent') permanent = literalBoolean(property.initializer);
  }
  if (!source || !destination) return null;
  return { type, source, destination, permanent: type === 'redirect' ? permanent : null, configFile };
}

async function collectAliases(root: string): Promise<readonly RouteAlias[]> {
  const selected = await firstExisting(root, NEXT_CONFIG_FILES);
  if (!selected) return [];
  const source = await readFile(selected, 'utf8');
  const sourceFile = ts.createSourceFile(selected, source, ts.ScriptTarget.Latest, true, scriptKind(selected));
  let configObject: ts.ObjectLiteralExpression | null = null;

  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.name.text === 'nextConfig' && declaration.initializer && ts.isObjectLiteralExpression(declaration.initializer)) {
          configObject = declaration.initializer;
        }
      }
    }
    if (ts.isExportAssignment(statement) && ts.isObjectLiteralExpression(statement.expression)) configObject = statement.expression;
  }
  if (!configObject) return [];

  const aliases: RouteAlias[] = [];
  for (const property of configObject.properties) {
    if (!ts.isPropertyAssignment(property) && !ts.isMethodDeclaration(property)) continue;
    const name = propertyName(property.name);
    if (name !== 'redirects' && name !== 'rewrites') continue;
    let expression: ts.Expression | null = null;
    if (ts.isPropertyAssignment(property)) expression = returnedExpression(property.initializer);
    if (ts.isMethodDeclaration(property)) {
      const statement = property.body?.statements.find(ts.isReturnStatement);
      expression = statement?.expression ?? null;
    }
    for (const object of aliasObjects(expression)) {
      const alias = parseAliasObject(object, name === 'redirects' ? 'redirect' : 'rewrite', toProjectPath(root, selected));
      if (alias) aliases.push(alias);
    }
  }
  return aliases.sort((left, right) => left.source.localeCompare(right.source) || left.type.localeCompare(right.type));
}

function duplicateAndConflictIssues(routes: readonly RouteRecord[]): RoutingIssue[] {
  const issues: RoutingIssue[] = [];
  const byPattern = new Map<string, RouteRecord[]>();
  for (const route of routes) byPattern.set(route.pattern, [...(byPattern.get(route.pattern) ?? []), route]);

  for (const [pattern, records] of byPattern) {
    const pagesBySlot = new Map<string, RouteRecord[]>();
    for (const page of records.filter(({ kind }) => kind === 'page')) {
      const slotKey = page.parallelSlots.join('/') || '<primary>';
      pagesBySlot.set(slotKey, [...(pagesBySlot.get(slotKey) ?? []), page]);
    }
    for (const [slot, pages] of pagesBySlot) {
      if (pages.length > 1) {
        issues.push({ severity: 'error', code: 'ROUTE_PAGE_COLLISION', file: pages.map(({ entrypoint }) => entrypoint).join(' | '), message: `Több page ugyanarra a publikus patternre és slotra képeződik: ${pattern} (${slot})` });
      }
    }

    const handlers = records.filter(({ kind }) => kind === 'handler');
    if (handlers.length > 1) {
      issues.push({ severity: 'error', code: 'ROUTE_HANDLER_COLLISION', file: handlers.map(({ entrypoint }) => entrypoint).join(' | '), message: `Több Route Handler ugyanarra a publikus patternre képeződik: ${pattern}` });
    }

    const primaryPages = records.filter(({ kind, parallelSlots }) => kind === 'page' && parallelSlots.length === 0);
    if (primaryPages.length > 0 && handlers.length > 0) {
      issues.push({ severity: 'error', code: 'ROUTE_PAGE_HANDLER_CONFLICT', file: [...primaryPages, ...handlers].map(({ entrypoint }) => entrypoint).join(' | '), message: `A page és Route Handler nem osztozhat ugyanazon a route-szegmensen: ${pattern}` });
    }
  }
  return issues;
}

function routeShapeIssues(routes: readonly RouteRecord[]): RoutingIssue[] {
  const issues: RoutingIssue[] = [];
  for (const route of routes) {
    if (route.kind === 'handler' && route.methods.length === 0) {
      issues.push({ severity: 'error', code: 'ROUTE_HANDLER_METHOD_MISSING', file: route.entrypoint, message: 'A Route Handler nem exportál támogatott HTTP-metódust.' });
    }
    if (route.dynamicSegments.length > 0 && !route.hasInputSchema) {
      issues.push({ severity: 'error', code: 'ROUTE_DYNAMIC_SCHEMA_MISSING', file: route.entrypoint, message: `A dinamikus route (${route.pattern}) nem importál műveletspecifikus input schemát.` });
    }
    if (route.dynamicSegments.some(({ kind }) => kind !== 'dynamic') && route.pattern.split('/').filter(Boolean).length <= 1) {
      issues.push({ severity: 'warning', code: 'ROUTE_CATCH_ALL_TOO_BROAD', file: route.entrypoint, message: `A route gyökérközeli catch-all szegmenst használ: ${route.pattern}` });
    }
    if (route.interceptingSegments.length > 0) {
      issues.push({ severity: 'warning', code: 'ROUTE_INTERCEPTING_APPROXIMATION', file: route.entrypoint, message: 'Az intercepting route diagnosztikai patternje közelítés; a Next.js runtime marad autoritatív.' });
    }
  }
  return issues;
}

function aliasPatternToRoutePattern(value: string): string {
  const pathOnly = value.split('?')[0] ?? value;
  return pathOnly
    .replace(/:([A-Za-z0-9_]+)\*/gu, '[...$1]')
    .replace(/:([A-Za-z0-9_]+)/gu, '[$1]');
}

function aliasIssues(routes: readonly RouteRecord[], aliases: readonly RouteAlias[]): RoutingIssue[] {
  const issues: RoutingIssue[] = [];
  const sources = new Map<string, RouteAlias[]>();
  const routePatterns = new Set(routes.map(({ pattern }) => pattern));

  for (const alias of aliases) {
    sources.set(alias.source, [...(sources.get(alias.source) ?? []), alias]);
    if (alias.destination.startsWith('//')) {
      issues.push({ severity: 'error', code: 'ROUTE_ALIAS_PROTOCOL_RELATIVE', file: alias.configFile, message: `A destination protocol-relative URL-t használ: ${alias.destination}` });
    }
    if (alias.source === alias.destination) {
      issues.push({ severity: 'error', code: 'ROUTE_ALIAS_SELF_LOOP', file: alias.configFile, message: `Az alias önmagára mutat: ${alias.source}` });
    }
    if (alias.destination.startsWith('/')) {
      const normalized = aliasPatternToRoutePattern(alias.destination);
      if (!routePatterns.has(normalized) && !aliases.some(({ source }) => aliasPatternToRoutePattern(source) === normalized)) {
        issues.push({ severity: 'warning', code: 'ROUTE_ALIAS_DESTINATION_UNKNOWN', file: alias.configFile, message: `A belső destination nem azonosítható route-ként: ${alias.destination}` });
      }
    }
  }

  for (const [source, values] of sources) {
    if (values.length > 1) {
      issues.push({ severity: 'error', code: 'ROUTE_ALIAS_DUPLICATE_SOURCE', file: values.map(({ configFile }) => configFile).join(' | '), message: `Több alias használja ugyanazt a source pattern-t: ${source}` });
    }
  }

  for (const alias of aliases.filter(({ type }) => type === 'redirect')) {
    const chained = aliases.find(({ source }) => source === alias.destination && source !== alias.source);
    if (chained) {
      issues.push({ severity: 'warning', code: 'ROUTE_REDIRECT_CHAIN', file: alias.configFile, message: `Redirectlánc észlelhető: ${alias.source} → ${alias.destination} → ${chained.destination}` });
    }
  }
  return issues;
}

export async function buildRouteInventory(root = process.cwd()): Promise<RouteInventory> {
  const appRoot = path.join(root, 'src/app');
  const issues: RoutingIssue[] = [];
  if (!(await exists(appRoot))) {
    return {
      schemaVersion: 1,
      appRoot: 'src/app',
      routes: [],
      aliases: [],
      issues: [{ severity: 'error', code: 'ROUTE_APP_ROOT_MISSING', file: 'src/app', message: 'A Next.js app root nem található.' }],
    };
  }

  const routes = await Promise.all((await collectEntrypoints(appRoot)).map((entrypoint) => routeRecord(root, appRoot, entrypoint)));
  const aliases = await collectAliases(root);
  issues.push(...duplicateAndConflictIssues(routes), ...routeShapeIssues(routes), ...aliasIssues(routes, aliases));

  return {
    schemaVersion: 1,
    appRoot: 'src/app',
    routes: routes.sort((left, right) => left.pattern.localeCompare(right.pattern) || left.kind.localeCompare(right.kind) || left.entrypoint.localeCompare(right.entrypoint)),
    aliases,
    issues: issues.sort((left, right) => left.file.localeCompare(right.file) || left.code.localeCompare(right.code)),
  };
}

export function inspectRoutePattern(inventory: RouteInventory, pattern: string): readonly RouteRecord[] {
  return inventory.routes.filter((route) => route.pattern === pattern).sort((left, right) => left.kind.localeCompare(right.kind));
}
