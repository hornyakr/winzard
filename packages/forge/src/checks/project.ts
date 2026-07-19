import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import ts from 'typescript';

import { runDocumentationChecks } from '../documentation/checks';
import { loadProjectManifest, type WinzardCapability, type WinzardManifest } from '../manifest';
import { runRouteChecks } from '../routing/checks';
import { runViewChecks } from '../views/checks';

export type CheckFailure = Readonly<{
  code: string;
  file: string;
  message: string;
}>;

export type SourceInspectionInput = Readonly<{
  root: string;
  filePath: string;
  source: string;
}>;

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);
const IGNORED_DIRECTORIES = new Set(['generated', '.next', 'node_modules']);
const ORM_PACKAGES = ['@prisma/client', '@prisma/adapter-', 'pg', 'postgres', 'drizzle-orm'] as const;

const CAPABILITY_REQUIREMENTS: Readonly<Record<WinzardCapability, Readonly<{
  all?: readonly string[];
  any?: readonly (readonly string[])[];
  requires?: readonly WinzardCapability[];
}>>> = {
  'next-app': {
    all: ['src/app', 'tsconfig.json'],
    any: [['next.config.ts', 'next.config.mjs', 'next.config.js']],
  },
  forge: {},
  'presentation-contract': { all: ['src/app'], requires: ['next-app', 'forge'] },
  'modular-application': { all: ['src/modules', 'src/composition'] },
  liveness: { all: ['src/app/api/health/live/route.ts'] },
  'prisma-postgresql': {
    all: ['prisma/schema.prisma', 'src/platform/database/database-env.server.ts'],
    any: [['prisma.config.ts', 'prisma.config.mts', '.config/prisma.ts']],
  },
  'database-readiness': {
    all: ['src/app/api/health/ready/route.ts', 'src/platform/database/readiness.ts'],
    requires: ['prisma-postgresql'],
  },
  authentication: { all: ['src/platform/auth/auth-env.server.ts'] },
  'project-documentation': {
    all: [
      'docs/00-home',
      'docs/40-delivery',
      'docs/80-winzard',
      'docs/90-generated',
      'docs/_templates',
      'docs/_system/documentation.json',
    ],
    requires: ['forge'],
  },
  'ai-delivery': {
    all: [
      'docs/70-ai/policies',
      'AGENTS.md',
      'CLAUDE.md',
      'GEMINI.md',
      '.github/copilot-instructions.md',
    ],
    requires: ['project-documentation'],
  },
  'forge-development': { all: ['packages/forge/src'] },
  templates: { all: ['templates/minimal', 'templates/webapp'] },
  'reference-app': { all: ['apps/reference'] },
};

function toProjectPath(root: string, filePath: string): string {
  return path.relative(root, filePath).split(path.sep).join('/');
}

function scriptKind(filePath: string): ts.ScriptKind {
  if (filePath.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (filePath.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (filePath.endsWith('.js') || filePath.endsWith('.mjs') || filePath.endsWith('.cjs')) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function hasDirective(sourceFile: ts.SourceFile, directive: string): boolean {
  for (const statement of sourceFile.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) return false;
    if (statement.expression.text === directive) return true;
  }
  return false;
}

function collectImportSpecifiers(sourceFile: ts.SourceFile): readonly string[] {
  const specifiers = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.add(node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node) && node.arguments.length === 1) {
      const [argument] = node.arguments;
      const dynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const requireCall = ts.isIdentifier(node.expression) && node.expression.text === 'require';
      if ((dynamicImport || requireCall) && argument && ts.isStringLiteral(argument)) {
        specifiers.add(argument.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...specifiers].sort();
}

function collectStaticFetchUrls(sourceFile: ts.SourceFile): readonly string[] {
  const urls = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'fetch' &&
      node.arguments.length > 0
    ) {
      const [argument] = node.arguments;
      if (argument && (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))) {
        urls.add(argument.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...urls].sort();
}

function resolveProjectImport(root: string, filePath: string, specifier: string): string | null {
  if (specifier.startsWith('@/')) return toProjectPath(root, path.resolve(root, 'src', specifier.slice(2)));
  if (specifier.startsWith('.')) return toProjectPath(root, path.resolve(path.dirname(filePath), specifier));
  return null;
}

function isDirectOrmImport(specifier: string, resolvedProjectPath: string | null): boolean {
  const packageImport = ORM_PACKAGES.some((packageName) =>
    specifier === packageName ||
    specifier.startsWith(`${packageName}/`) ||
    specifier.startsWith(packageName));
  const localImport =
    resolvedProjectPath === 'src/platform/database/client' ||
    resolvedProjectPath?.startsWith('src/platform/database/client.') === true ||
    resolvedProjectPath?.startsWith('src/generated/prisma') === true;
  return packageImport || localImport;
}

function isApplicationFrameworkImport(specifier: string): boolean {
  return (
    specifier === 'next' ||
    specifier.startsWith('next/') ||
    specifier === 'react' ||
    specifier.startsWith('react/') ||
    specifier === 'server-only' ||
    specifier.startsWith('node:')
  );
}

function isOwnApiUrl(url: string): boolean {
  return url === '/api' || url.startsWith('/api/') || /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/api(?:\/|$)/u.test(url);
}

export function inspectSourceFile({ root, filePath, source }: SourceInspectionInput): readonly CheckFailure[] {
  const projectFile = toProjectPath(root, filePath);
  const sourceFile = ts.createSourceFile(projectFile, source, ts.ScriptTarget.Latest, true, scriptKind(filePath));
  const imports = collectImportSpecifiers(sourceFile).map((specifier) => ({
    specifier,
    resolvedProjectPath: resolveProjectImport(root, filePath, specifier),
  }));
  const clientComponent = hasDirective(sourceFile, 'use client');
  const importsServerOnly = imports.some(({ specifier }) => specifier === 'server-only');
  const failures: CheckFailure[] = [];
  const keys = new Set<string>();
  const add = (code: string, message: string): void => {
    const key = `${code}:${message}`;
    if (!keys.has(key)) {
      keys.add(key);
      failures.push({ code, file: projectFile, message });
    }
  };

  if (projectFile.startsWith('src/app/')) {
    for (const reference of imports) {
      if (isDirectOrmImport(reference.specifier, reference.resolvedProjectPath)) {
        add('APP_DIRECT_ORM_IMPORT', `A delivery réteg közvetlen ORM-importot használ: ${reference.specifier}`);
      }
    }
    if (!clientComponent) {
      for (const url of collectStaticFetchUrls(sourceFile)) {
        if (isOwnApiUrl(url)) add('APP_INTERNAL_HTTP_CALL', `A Server Component vagy Route Handler saját HTTP API-t hív: ${url}`);
      }
    }
  }

  if (projectFile.includes('/application/')) {
    for (const reference of imports) {
      if (isApplicationFrameworkImport(reference.specifier)) {
        add('APPLICATION_FRAMEWORK_IMPORT', `Az application réteg framework- vagy runtime-specifikus importot használ: ${reference.specifier}`);
      }
      if (
        reference.resolvedProjectPath?.includes('/infrastructure/') ||
        reference.resolvedProjectPath?.includes('/presentation/') ||
        reference.resolvedProjectPath?.startsWith('src/composition/') ||
        reference.resolvedProjectPath?.startsWith('src/app/')
      ) {
        add('APPLICATION_OUTWARD_IMPORT', `Az application réteg kifelé mutató függőséget használ: ${reference.specifier}`);
      }
      if (isDirectOrmImport(reference.specifier, reference.resolvedProjectPath)) {
        add('APPLICATION_ORM_IMPORT', `Az application réteg közvetlen ORM-importot használ: ${reference.specifier}`);
      }
    }
  }

  if (clientComponent) {
    for (const reference of imports) {
      const serverImport =
        reference.specifier === 'server-only' ||
        reference.specifier.startsWith('node:') ||
        reference.specifier.includes('.server') ||
        reference.resolvedProjectPath?.startsWith('src/composition/') === true ||
        reference.resolvedProjectPath?.includes('/infrastructure/') === true ||
        reference.resolvedProjectPath?.startsWith('src/platform/database/') === true ||
        isDirectOrmImport(reference.specifier, reference.resolvedProjectPath);
      if (serverImport) add('CLIENT_SERVER_IMPORT', `A Client Component szerveroldali importot használ: ${reference.specifier}`);
    }
  }

  if (projectFile.startsWith('src/composition/') && !importsServerOnly) {
    add('COMPOSITION_MISSING_SERVER_ONLY', 'A composition root fájlnak explicit server-only határt kell deklarálnia.');
  }
  if (
    projectFile.includes('/infrastructure/') &&
    imports.some(({ specifier }) => specifier.startsWith('node:')) &&
    !importsServerOnly
  ) {
    add('NODE_ADAPTER_MISSING_SERVER_ONLY', 'A Node.js runtime API-t használó infrastruktúra-adapterből hiányzik a server-only import.');
  }

  return failures;
}

async function exists(filePath: string): Promise<boolean> {
  try { await access(filePath); return true; } catch { return false; }
}

async function collectSourceFiles(directory: string): Promise<readonly string[]> {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }

  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name)) files.push(...(await collectSourceFiles(entryPath)));
    } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(entryPath);
    }
  }
  return files.sort();
}

async function checkCapabilities(root: string, manifest: WinzardManifest): Promise<readonly CheckFailure[]> {
  const failures: CheckFailure[] = [];
  const enabled = new Set(manifest.capabilities);

  for (const capability of manifest.capabilities) {
    const definition = CAPABILITY_REQUIREMENTS[capability];
    for (const dependency of definition.requires ?? []) {
      if (!enabled.has(dependency)) {
        failures.push({
          code: 'CAPABILITY_DEPENDENCY_MISSING',
          file: 'winzard manifest',
          message: `${capability} megköveteli ezt a capability-t: ${dependency}`,
        });
      }
    }
    for (const requiredPath of definition.all ?? []) {
      if (!(await exists(path.join(root, requiredPath)))) {
        failures.push({
          code: 'CAPABILITY_PATH_MISSING',
          file: requiredPath,
          message: `A(z) ${capability} capability kötelező útvonala hiányzik.`,
        });
      }
    }
    for (const alternatives of definition.any ?? []) {
      const present = (await Promise.all(alternatives.map((item) => exists(path.join(root, item))))).some(Boolean);
      if (!present) {
        failures.push({
          code: 'CAPABILITY_PATH_MISSING',
          file: alternatives.join(' | '),
          message: `A(z) ${capability} capability egyik alternatív útvonala sem található.`,
        });
      }
    }
  }
  return failures;
}

async function checkNoStore(root: string, file: string, code: string): Promise<readonly CheckFailure[]> {
  try {
    const source = await readFile(path.join(root, file), 'utf8');
    return source.includes('no-store')
      ? []
      : [{ code, file, message: 'A health válaszból hiányzik a no-store cache policy.' }];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function checkPrismaConfig(root: string): Promise<readonly CheckFailure[]> {
  const candidates = ['prisma.config.ts', 'prisma.config.mts', '.config/prisma.ts'];
  const candidate = await Promise.all(candidates.map(async (file) => ({ file, present: await exists(path.join(root, file)) })));
  const selected = candidate.find(({ present }) => present);
  if (!selected) return [];
  const source = await readFile(path.join(root, selected.file), 'utf8');
  const failures: CheckFailure[] = [];
  if (/\benv\s*\(\s*['"]DATABASE_URL['"]\s*\)/u.test(source)) {
    failures.push({
      code: 'PRISMA_CONFIG_EAGER_DATABASE_URL',
      file: selected.file,
      message: 'A Prisma Config ne használjon kötelező env(DATABASE_URL) hívást a generate-kompatibilis profilban.',
    });
  }
  if (!source.includes('process.env.DATABASE_URL')) {
    failures.push({
      code: 'PRISMA_CONFIG_DATABASE_URL_FALLBACK',
      file: selected.file,
      message: 'A Prisma Config közvetlen process.env.DATABASE_URL hozzáférést használjon opcionális fallbackkel.',
    });
  }
  return failures;
}

export async function runProjectChecks(root = process.cwd()): Promise<readonly CheckFailure[]> {
  const manifestResult = await loadProjectManifest(root);
  const failures: CheckFailure[] = [...manifestResult.failures];
  if (manifestResult.manifest === null) return failures;

  failures.push(...(await checkCapabilities(root, manifestResult.manifest)));
  const enabled = new Set(manifestResult.manifest.capabilities);
  if (enabled.has('next-app')) {
    const routingIssues = await runRouteChecks(root);
    failures.push(...routingIssues.filter(({ severity }) => severity === 'error').map(({ code, file, message }) => ({ code, file, message })));
  }
  if (enabled.has('presentation-contract')) {
    const viewIssues = await runViewChecks(root);
    failures.push(...viewIssues.filter(({ severity }) => severity === 'error').map(({ code, file, message }) => ({ code, file, message })));
  }
  if (enabled.has('liveness')) {
    failures.push(...(await checkNoStore(root, 'src/app/api/health/live/route.ts', 'LIVENESS_CACHE_POLICY')));
  }
  if (enabled.has('database-readiness')) {
    failures.push(...(await checkNoStore(root, 'src/app/api/health/ready/route.ts', 'READINESS_CACHE_POLICY')));
  }
  if (enabled.has('prisma-postgresql')) failures.push(...(await checkPrismaConfig(root)));

  for (const filePath of await collectSourceFiles(path.join(root, 'src'))) {
    failures.push(...inspectSourceFile({ root, filePath, source: await readFile(filePath, 'utf8') }));
  }

  if (enabled.has('project-documentation')) {
    const documentation = await runDocumentationChecks(root, manifestResult.manifest);
    failures.push(...documentation.errors.map(({ code, file, message }) => ({ code, file, message })));
  }

  return failures.sort((left, right) => left.file.localeCompare(right.file) || left.code.localeCompare(right.code));
}
