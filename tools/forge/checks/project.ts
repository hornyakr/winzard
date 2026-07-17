import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import ts from 'typescript';

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

const REQUIRED_PATHS = [
  'src/app',
  'src/modules',
  'src/platform',
  'src/composition',
  'prisma/schema.prisma',
  '.env.example',
] as const;

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);
const IGNORED_DIRECTORIES = new Set(['generated']);
const ORM_PACKAGES = ['@prisma/client', '@prisma/adapter-', 'pg', 'postgres', 'drizzle-orm'] as const;

function toProjectPath(root: string, filePath: string): string {
  return path.relative(root, filePath).split(path.sep).join('/');
}

function scriptKind(filePath: string): ts.ScriptKind {
  if (filePath.endsWith('.tsx')) {
    return ts.ScriptKind.TSX;
  }

  if (filePath.endsWith('.jsx')) {
    return ts.ScriptKind.JSX;
  }

  if (filePath.endsWith('.js') || filePath.endsWith('.mjs') || filePath.endsWith('.cjs')) {
    return ts.ScriptKind.JS;
  }

  return ts.ScriptKind.TS;
}

function hasDirective(sourceFile: ts.SourceFile, directive: string): boolean {
  for (const statement of sourceFile.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) {
      return false;
    }

    if (statement.expression.text === directive) {
      return true;
    }
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
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';

      if ((isDynamicImport || isRequire) && argument && ts.isStringLiteral(argument)) {
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
  if (specifier.startsWith('@/')) {
    return toProjectPath(root, path.resolve(root, 'src', specifier.slice(2)));
  }

  if (specifier.startsWith('.')) {
    return toProjectPath(root, path.resolve(path.dirname(filePath), specifier));
  }

  return null;
}

function isDirectOrmImport(specifier: string, resolvedProjectPath: string | null): boolean {
  const packageImport = ORM_PACKAGES.some(
    (packageName) => specifier === packageName || specifier.startsWith(`${packageName}/`) || specifier.startsWith(packageName),
  );

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
  return (
    url === '/api' ||
    url.startsWith('/api/') ||
    /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/api(?:\/|$)/u.test(url)
  );
}

export function inspectSourceFile({ root, filePath, source }: SourceInspectionInput): readonly CheckFailure[] {
  const projectFile = toProjectPath(root, filePath);
  const sourceFile = ts.createSourceFile(
    projectFile,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(filePath),
  );
  const imports = collectImportSpecifiers(sourceFile).map((specifier) => ({
    specifier,
    resolvedProjectPath: resolveProjectImport(root, filePath, specifier),
  }));
  const isClientComponent = hasDirective(sourceFile, 'use client');
  const importsServerOnly = imports.some(({ specifier }) => specifier === 'server-only');
  const failures: CheckFailure[] = [];
  const failureKeys = new Set<string>();

  const addFailure = (code: string, message: string): void => {
    const key = `${code}:${message}`;

    if (failureKeys.has(key)) {
      return;
    }

    failureKeys.add(key);
    failures.push({ code, file: projectFile, message });
  };

  if (projectFile.startsWith('src/app/')) {
    for (const importReference of imports) {
      if (isDirectOrmImport(importReference.specifier, importReference.resolvedProjectPath)) {
        addFailure(
          'APP_DIRECT_ORM_IMPORT',
          `A delivery réteg közvetlen ORM-importot használ: ${importReference.specifier}`,
        );
      }
    }

    if (!isClientComponent) {
      for (const url of collectStaticFetchUrls(sourceFile)) {
        if (isOwnApiUrl(url)) {
          addFailure(
            'APP_INTERNAL_HTTP_CALL',
            `A Server Component vagy Route Handler saját HTTP API-t hív: ${url}`,
          );
        }
      }
    }
  }

  if (projectFile.includes('/application/')) {
    for (const importReference of imports) {
      if (isApplicationFrameworkImport(importReference.specifier)) {
        addFailure(
          'APPLICATION_FRAMEWORK_IMPORT',
          `Az application réteg framework- vagy runtime-specifikus importot használ: ${importReference.specifier}`,
        );
      }

      if (
        importReference.resolvedProjectPath?.includes('/infrastructure/') ||
        importReference.resolvedProjectPath?.includes('/presentation/') ||
        importReference.resolvedProjectPath?.startsWith('src/composition/') ||
        importReference.resolvedProjectPath?.startsWith('src/app/')
      ) {
        addFailure(
          'APPLICATION_OUTWARD_IMPORT',
          `Az application réteg kifelé mutató függőséget használ: ${importReference.specifier}`,
        );
      }

      if (isDirectOrmImport(importReference.specifier, importReference.resolvedProjectPath)) {
        addFailure(
          'APPLICATION_ORM_IMPORT',
          `Az application réteg közvetlen ORM-importot használ: ${importReference.specifier}`,
        );
      }
    }
  }

  if (isClientComponent) {
    for (const importReference of imports) {
      const serverImport =
        importReference.specifier === 'server-only' ||
        importReference.specifier.startsWith('node:') ||
        importReference.specifier.includes('.server') ||
        importReference.resolvedProjectPath?.startsWith('src/composition/') === true ||
        importReference.resolvedProjectPath?.includes('/infrastructure/') === true ||
        importReference.resolvedProjectPath?.startsWith('src/platform/database/') === true ||
        isDirectOrmImport(importReference.specifier, importReference.resolvedProjectPath);

      if (serverImport) {
        addFailure(
          'CLIENT_SERVER_IMPORT',
          `A Client Component szerveroldali importot használ: ${importReference.specifier}`,
        );
      }
    }
  }

  if (projectFile.startsWith('src/composition/') && !importsServerOnly) {
    addFailure(
      'COMPOSITION_MISSING_SERVER_ONLY',
      'A composition root fájlnak explicit server-only határt kell deklarálnia.',
    );
  }

  if (
    projectFile.includes('/infrastructure/') &&
    imports.some(({ specifier }) => specifier.startsWith('node:')) &&
    !importsServerOnly
  ) {
    addFailure(
      'NODE_ADAPTER_MISSING_SERVER_ONLY',
      'A Node.js runtime API-t használó infrastruktúra-adapterből hiányzik a server-only import.',
    );
  }

  return failures;
}

async function collectSourceFiles(directory: string): Promise<readonly string[]> {
  let entries;

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }

    throw error;
  }

  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name)) {
        files.push(...(await collectSourceFiles(entryPath)));
      }
      continue;
    }

    if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(entryPath);
    }
  }

  return files.sort();
}

async function checkRequiredPaths(root: string): Promise<readonly CheckFailure[]> {
  const failures: CheckFailure[] = [];

  for (const requiredPath of REQUIRED_PATHS) {
    try {
      await access(path.join(root, requiredPath));
    } catch {
      failures.push({
        code: 'REQUIRED_PATH_MISSING',
        file: requiredPath,
        message: 'A kötelező projektútvonal hiányzik.',
      });
    }
  }

  return failures;
}

async function checkHealthCachePolicy(root: string): Promise<readonly CheckFailure[]> {
  const file = 'src/app/api/health/live/route.ts';

  try {
    const source = await readFile(path.join(root, file), 'utf8');

    if (!source.includes('no-store')) {
      return [{ code: 'HEALTH_CACHE_POLICY', file, message: 'A liveness válaszból hiányzik a no-store cache policy.' }];
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [{ code: 'HEALTH_ROUTE_MISSING', file, message: 'A liveness Route Handler hiányzik.' }];
    }

    throw error;
  }

  return [];
}

export async function runProjectChecks(root = process.cwd()): Promise<readonly CheckFailure[]> {
  const failures: CheckFailure[] = [
    ...(await checkRequiredPaths(root)),
    ...(await checkHealthCachePolicy(root)),
  ];
  const sourceFiles = await collectSourceFiles(path.join(root, 'src'));

  for (const filePath of sourceFiles) {
    const source = await readFile(filePath, 'utf8');
    failures.push(...inspectSourceFile({ root, filePath, source }));
  }

  return failures.sort((left, right) => {
    const fileOrder = left.file.localeCompare(right.file);
    return fileOrder === 0 ? left.code.localeCompare(right.code) : fileOrder;
  });
}
