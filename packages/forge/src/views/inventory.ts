import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import ts from 'typescript';

import type {
  ViewAssetContract,
  ViewBoundary,
  ViewImageAsset,
  ViewInventory,
  ViewIssue,
  ViewKind,
  ViewRecord,
} from './types';

const SCRIPT_EXTENSION = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/u;
const VIEW_SOURCE_EXTENSION = /\.(?:tsx|jsx|md|mdx)$/u;
const CONTENT_EXTENSION = /\.(?:md|mdx)$/u;
const TEST_EXTENSION = /\.(?:test|spec)\.(?:ts|tsx|js|jsx)$/u;
const STATIC_ASSET_EXTENSION = /\.(?:avif|bmp|gif|ico|jpe?g|pdf|png|svg|ttf|otf|webp|woff2?)$/iu;
const STYLESHEET_EXTENSION = /\.(?:css|less|sass|scss|styl)$/iu;
const ROUTE_VIEW_NAMES = new Map<string, ViewKind>([
  ['page', 'page'],
  ['layout', 'layout'],
  ['template', 'template'],
  ['loading', 'loading'],
  ['error', 'error'],
  ['not-found', 'not-found'],
  ['default', 'default'],
]);
const KIND_ORDER: Readonly<Record<ViewKind, number>> = {
  layout: 0,
  template: 1,
  page: 2,
  loading: 3,
  error: 4,
  'not-found': 5,
  default: 6,
  email: 7,
  content: 8,
  component: 9,
};

function projectPath(root: string, filePath: string): string {
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

async function collect(directory: string, predicate: (fileName: string) => boolean): Promise<readonly string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }

  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'coverage' || entry.name === 'generated') continue;
    const current = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collect(current, predicate));
    else if (entry.isFile() && predicate(entry.name)) files.push(current);
  }
  return files.sort();
}

function scriptKind(filePath: string): ts.ScriptKind {
  if (filePath.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (filePath.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (/\.(?:js|mjs|cjs)$/u.test(filePath)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function parse(filePath: string, source: string): ts.SourceFile {
  return ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, scriptKind(filePath));
}

function modifiers(node: ts.Node): readonly ts.Modifier[] {
  return ts.canHaveModifiers(node) ? ts.getModifiers(node) ?? [] : [];
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return modifiers(node).some((modifier) => modifier.kind === kind);
}

function isExported(node: ts.Node): boolean {
  return hasModifier(node, ts.SyntaxKind.ExportKeyword);
}

function isDefaultExport(node: ts.Node): boolean {
  return isExported(node) && hasModifier(node, ts.SyntaxKind.DefaultKeyword);
}

function isAsync(node: ts.Node): boolean {
  return hasModifier(node, ts.SyntaxKind.AsyncKeyword);
}

function boundary(sourceFile: ts.SourceFile, kind: ViewKind): ViewBoundary {
  if (kind === 'content') return 'static';
  const directive = sourceFile.statements.find((statement) => !ts.isEmptyStatement(statement));
  if (
    directive &&
    ts.isExpressionStatement(directive) &&
    ts.isStringLiteral(directive.expression) &&
    directive.expression.text === 'use client'
  ) return 'client';
  return 'server';
}

function fileStem(filePath: string): string {
  return path.basename(filePath).replace(/\.(?:tsx?|jsx?|mdx?)$/u, '');
}

function pascal(value: string): string {
  return value
    .split(/[^A-Za-z0-9]+/u)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join('');
}

function derivedName(filePath: string, kind: ViewKind): string {
  const directory = path.basename(path.dirname(filePath));
  const stem = fileStem(filePath);
  if (kind === 'page') return `${directory === 'app' ? 'Home' : pascal(directory)}Page`;
  if (kind === 'layout') return `${directory === 'app' ? 'Root' : pascal(directory)}Layout`;
  if (kind === 'template') return `${pascal(directory)}Template`;
  if (kind === 'loading') return `${pascal(directory)}Loading`;
  if (kind === 'error') return `${pascal(directory)}Error`;
  if (kind === 'not-found') return `${pascal(directory)}NotFound`;
  if (kind === 'default') return `${pascal(directory)}Default`;
  if (kind === 'content') return pascal(stem);
  return pascal(stem);
}

function routeFor(appRoot: string, filePath: string): string {
  const relative = path.relative(appRoot, path.dirname(filePath));
  const segments = relative === '' ? [] : relative.split(path.sep);
  const visible: string[] = [];
  for (const raw of segments) {
    if (/^\([^/]+\)$/u.test(raw) || raw.startsWith('@')) continue;
    const intercepting = raw.match(/^(?:\(\.\.\.\)|\(\.\.\)\(\.\.\)|\(\.\.\)|\(\.\))(.+)$/u);
    visible.push(intercepting?.[1] ?? raw);
  }
  return visible.length === 0 ? '/' : `/${visible.join('/')}`;
}

function routeKind(filePath: string, appRoot: string): ViewKind | null {
  const relative = path.relative(appRoot, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  const kind = ROUTE_VIEW_NAMES.get(fileStem(filePath));
  return kind ?? null;
}

function isEmailComponent(filePath: string): boolean {
  const normalized = filePath.split(path.sep).join('/');
  if (!/\.(?:tsx|jsx)$/u.test(filePath)) return false;
  if (/\.(?:renderer|presenter|view-model)\.(?:tsx|jsx)$/u.test(filePath)) return false;
  return normalized.includes('/presentation/email/') || /(?:^|[-.])email\.(?:tsx|jsx)$/u.test(path.basename(filePath));
}

function isPresentationComponent(filePath: string): boolean {
  const normalized = filePath.split(path.sep).join('/');
  if (!/\.(?:tsx|jsx)$/u.test(filePath)) return false;
  if (!normalized.includes('/presentation/') && !normalized.includes('/src/platform/ui/')) return false;
  if (/\.(?:actions?|actor|action-state|http|presenter|renderer|routes?|schemas?|view-model)\.(?:tsx|jsx)$/u.test(filePath)) return false;
  if (/(?:^|\/)index\.(?:tsx|jsx)$/u.test(normalized)) return false;
  if (/\.(?:stories|test|spec)\.(?:tsx|jsx)$/u.test(filePath)) return false;
  return true;
}

function exportedFunctions(sourceFile: ts.SourceFile): readonly Readonly<{
  name: string;
  async: boolean;
  parameter: ts.ParameterDeclaration | null;
  defaultExport: boolean;
}>[] {
  const output: Array<Readonly<{
    name: string;
    async: boolean;
    parameter: ts.ParameterDeclaration | null;
    defaultExport: boolean;
  }>> = [];

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && isExported(statement)) {
      const name = statement.name?.text;
      if (name) output.push({
        name,
        async: isAsync(statement),
        parameter: statement.parameters[0] ?? null,
        defaultExport: isDefaultExport(statement),
      });
      continue;
    }
    if (!ts.isVariableStatement(statement) || !isExported(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name)) continue;
      if (!declaration.initializer || (!ts.isArrowFunction(declaration.initializer) && !ts.isFunctionExpression(declaration.initializer))) continue;
      output.push({
        name: declaration.name.text,
        async: isAsync(declaration.initializer),
        parameter: declaration.initializer.parameters[0] ?? null,
        defaultExport: false,
      });
    }
  }
  return output;
}

function defaultFunction(sourceFile: ts.SourceFile): Readonly<{
  name: string | null;
  async: boolean;
  parameter: ts.ParameterDeclaration | null;
}> | null {
  const declared = exportedFunctions(sourceFile).find(({ defaultExport }) => defaultExport);
  if (declared) return { name: declared.name, async: declared.async, parameter: declared.parameter };

  for (const statement of sourceFile.statements) {
    if (!ts.isExportAssignment(statement) || statement.isExportEquals) continue;
    const expression = statement.expression;
    if (ts.isIdentifier(expression)) {
      const target = exportedFunctions(sourceFile).find(({ name }) => name === expression.text);
      if (target) return { name: target.name, async: target.async, parameter: target.parameter };
    }
  }
  return null;
}

function typeName(node: ts.TypeNode | undefined): string | null {
  if (!node) return null;
  if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) return node.typeName.text;
  return null;
}

function unwrapReadonly(node: ts.TypeNode): ts.TypeNode {
  if (
    ts.isTypeReferenceNode(node) &&
    ts.isIdentifier(node.typeName) &&
    node.typeName.text === 'Readonly' &&
    node.typeArguments?.[0]
  ) return node.typeArguments[0];
  return node;
}

function propertyNames(node: ts.TypeNode | ts.InterfaceDeclaration): readonly string[] {
  const actual = ts.isInterfaceDeclaration(node) ? node : unwrapReadonly(node);
  if (!ts.isTypeLiteralNode(actual) && !ts.isInterfaceDeclaration(actual)) return [];
  const names = new Set<string>();
  for (const member of actual.members) {
    if (!ts.isPropertySignature(member) && !ts.isMethodSignature(member)) continue;
    if (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name) || ts.isNumericLiteral(member.name)) names.add(member.name.text);
  }
  return [...names].sort();
}

function declarationForType(sourceFile: ts.SourceFile, name: string): ts.TypeAliasDeclaration | ts.InterfaceDeclaration | null {
  for (const statement of sourceFile.statements) {
    if (ts.isTypeAliasDeclaration(statement) && statement.name.text === name) return statement;
    if (ts.isInterfaceDeclaration(statement) && statement.name.text === name) return statement;
  }
  return null;
}

function propsContract(
  sourceFile: ts.SourceFile,
  parameter: ts.ParameterDeclaration | null,
): Readonly<{ propsType: string | null; props: readonly string[] }> {
  if (!parameter) return { propsType: null, props: [] };
  const propsType = typeName(parameter.type);
  if (propsType) {
    const declaration = declarationForType(sourceFile, propsType);
    if (declaration) {
      return {
        propsType,
        props: ts.isTypeAliasDeclaration(declaration)
          ? propertyNames(declaration.type)
          : propertyNames(declaration),
      };
    }
    const inlineProps = parameter.type ? propertyNames(parameter.type) : [];
    if (inlineProps.length > 0) {
      return { propsType: propsType === 'Readonly' ? null : propsType, props: inlineProps };
    }
    return { propsType, props: [] };
  }
  if (parameter.type) return { propsType: null, props: propertyNames(parameter.type) };
  if (ts.isObjectBindingPattern(parameter.name)) {
    return {
      propsType: null,
      props: parameter.name.elements
        .map((element) => ts.isIdentifier(element.name) ? element.name.text : null)
        .filter((value): value is string => value !== null)
        .sort(),
    };
  }
  return { propsType: null, props: [] };
}

function importInformation(sourceFile: ts.SourceFile): Readonly<{
  imports: readonly string[];
  importMap: ReadonlyMap<string, string>;
  viewModels: readonly string[];
  routeBuilders: readonly string[];
  nextImageNames: ReadonlySet<string>;
}> {
  const imports = new Set<string>();
  const importMap = new Map<string, string>();
  const viewModels = new Set<string>();
  const routeBuilders = new Set<string>();
  const nextImageNames = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const specifier = statement.moduleSpecifier.text;
    imports.add(specifier);
    const clause = statement.importClause;
    if (!clause) continue;
    if (clause.name) {
      importMap.set(clause.name.text, specifier);
      if (/ViewModel$/u.test(clause.name.text)) viewModels.add(clause.name.text);
      if (specifier === 'next/image') nextImageNames.add(clause.name.text);
    }
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) {
      importMap.set(bindings.name.text, specifier);
    }
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        const local = element.name.text;
        importMap.set(local, specifier);
        if (/ViewModel$/u.test(local)) viewModels.add(local);
        if (/(?:^|\.)routes?$/iu.test(specifier) || /[-.]routes?$/iu.test(specifier)) {
          routeBuilders.add(`${specifier}#${local}`);
        }
      }
    }
  }

  return {
    imports: [...imports].sort(),
    importMap,
    viewModels: [...viewModels].sort(),
    routeBuilders: [...routeBuilders].sort(),
    nextImageNames,
  };
}

function referencedViewModels(sourceFile: ts.SourceFile): readonly string[] {
  const values = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName) && /ViewModel$/u.test(node.typeName.text)) {
      values.add(node.typeName.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...values].sort();
}

function attribute(element: ts.JsxOpeningLikeElement, name: string): ts.JsxAttribute | null {
  for (const property of element.attributes.properties) {
    if (ts.isJsxAttribute(property) && property.name.getText() === name) return property;
  }
  return null;
}

function attributeValue(
  property: ts.JsxAttribute | null,
  importMap: ReadonlyMap<string, string>,
): string | null {
  if (!property?.initializer) return null;
  if (ts.isStringLiteral(property.initializer)) return property.initializer.text;
  if (!ts.isJsxExpression(property.initializer) || !property.initializer.expression) return null;
  const expression = property.initializer.expression;
  if (ts.isStringLiteralLike(expression)) return expression.text;
  if (ts.isIdentifier(expression)) return importMap.get(expression.text) ?? null;
  return null;
}

function assetContract(
  sourceFile: ts.SourceFile,
  information: ReturnType<typeof importInformation>,
): ViewAssetContract {
  const images: ViewImageAsset[] = [];
  const stylesheets = new Set<string>();
  const fonts = new Set<string>();
  const scripts = new Set<string>();
  const staticAssets = new Set<string>();
  const publicUrls = new Set<string>();
  const externalUrls = new Set<string>();

  for (const specifier of information.imports) {
    if (STYLESHEET_EXTENSION.test(specifier)) stylesheets.add(specifier);
    if (STATIC_ASSET_EXTENSION.test(specifier)) staticAssets.add(specifier);
    if (specifier.startsWith('next/font/')) fonts.add(specifier);
    if (specifier === 'next/script') scripts.add(specifier);
  }

  const classifyUrl = (value: string | null): void => {
    if (!value) return;
    if (/^https?:\/\//iu.test(value)) externalUrls.add(value);
    else if (value.startsWith('/')) publicUrls.add(value);
  };

  const inspectOpening = (element: ts.JsxOpeningLikeElement): void => {
    const tag = element.tagName.getText(sourceFile);
    const sourceAttribute = attribute(element, 'src');
    const hrefAttribute = attribute(element, 'href');
    const source = attributeValue(sourceAttribute, information.importMap);
    const href = attributeValue(hrefAttribute, information.importMap);
    classifyUrl(source);
    classifyUrl(href);

    if (tag === 'img' || information.nextImageNames.has(tag)) {
      images.push({
        kind: tag === 'img' ? 'html-image' : 'next-image',
        source,
        hasAlt: attribute(element, 'alt') !== null,
      });
    }
  };

  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) inspectOpening(node);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  const imageOrder = (left: ViewImageAsset, right: ViewImageAsset): number =>
    `${left.kind}:${left.source ?? ''}:${left.hasAlt}`.localeCompare(`${right.kind}:${right.source ?? ''}:${right.hasAlt}`);

  return Object.freeze({
    images: Object.freeze(images.sort(imageOrder)),
    stylesheets: Object.freeze([...stylesheets].sort()),
    fonts: Object.freeze([...fonts].sort()),
    scripts: Object.freeze([...scripts].sort()),
    staticAssets: Object.freeze([...staticAssets].sort()),
    publicUrls: Object.freeze([...publicUrls].sort()),
    externalUrls: Object.freeze([...externalUrls].sort()),
  });
}

function issue(code: string, file: string, message: string, severity: ViewIssue['severity'] = 'error'): ViewIssue {
  return { severity, code, file, message };
}

function importsMatching(imports: readonly string[], pattern: RegExp): boolean {
  return imports.some((specifier) => pattern.test(specifier));
}

function dynamicImportExists(sourceFile: ts.SourceFile): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      !ts.isStringLiteralLike(node.arguments[0]) &&
      !ts.isNoSubstitutionTemplateLiteral(node.arguments[0])
    ) found = true;
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function inspectSourceIssues(
  root: string,
  absolute: string,
  source: string,
  sourceFile: ts.SourceFile,
): readonly ViewIssue[] {
  const file = projectPath(root, absolute);
  const normalized = `/${file}`;
  const information = importInformation(sourceFile);
  const client = boundary(sourceFile, 'component') === 'client';
  const appView = /\/src\/app\/(?:.*\/)?(?:page|layout|template|loading|error|not-found|default)\.(?:tsx|jsx)$/u.test(normalized);
  const presentation = normalized.includes('/presentation/') || appView || normalized.includes('/src/platform/ui/');
  const output: ViewIssue[] = [];

  if (presentation && importsMatching(information.imports, /(?:^@prisma\/|prisma|database(?:\/|$)|\/infrastructure\/)/iu)) {
    output.push(issue('VIEW_DIRECT_ORM_IMPORT', file, 'A presentation réteg közvetlen ORM-, adatbázis- vagy infrastruktúra-modult importál.'));
  }

  const domainImports = information.imports.filter((specifier) => /(?:^|\/)domain(?:\/|$)/u.test(specifier));
  if (presentation && domainImports.length > 0 && /(?:type|interface)\s+\w*Props\b[\s\S]*\b(?:Entity|Aggregate|Domain)\w*\b/u.test(source)) {
    output.push(issue('VIEW_DOMAIN_ENTITY_PROP', file, 'A nézet props-szerződése domain entitást vagy aggregate-et tesz presentation API-vá.'));
  } else if (presentation && domainImports.length > 0 && /\b\w*Props\b/u.test(source)) {
    output.push(issue('VIEW_DOMAIN_ENTITY_PROP', file, 'A nézet props-szerződése közvetlen domain importtól függ.'));
  }

  if (client && importsMatching(information.imports, /^(?:node:|server-only$)|(?:^|[/.])server(?:[/.]|$)|(?:^|\/)infrastructure(?:\/|$)|database(?:\/|$)/iu)) {
    output.push(issue('VIEW_SERVER_IMPORT_IN_CLIENT', file, 'A Client Component szerver-only vagy infrastruktúra-modult importál.'));
  }

  if (!client && /\bfetch\s*\(\s*['"](?:\/api(?:\/|['"])|https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/api)/iu.test(source)) {
    output.push(issue('VIEW_INTERNAL_HTTP_FETCH', file, 'A szerveroldali nézet saját HTTP API-n keresztül végez belső subrequestet.'));
  }

  if (/\bdangerouslySetInnerHTML\b/u.test(source) && !(/\bTrustedHtml\b/u.test(source) && /__html\s*:\s*[A-Za-z_$][\w$]*\.value/u.test(source))) {
    output.push(issue('VIEW_DANGEROUS_HTML', file, 'A raw HTML beillesztés nem auditált TrustedHtml szerződésből történik.'));
  }

  if (/(?:href|src)\s*=\s*\{\s*[A-Za-z_$][\w$]*(?:Url|URL|Href|Src)\s*\}/u.test(source)) {
    output.push(issue('VIEW_UNTRUSTED_URL', file, 'A URL-attribútum közvetlen, nem validált props/input értéket használ.'));
  }

  const dynamicImport = dynamicImportExists(sourceFile);
  if (dynamicImport) {
    output.push(issue('VIEW_DYNAMIC_IMPORT_PATH', file, 'A dinamikus import útvonala nem statikus allowlistből származik.'));
  }

  if (/\bprocess\.env\b/u.test(source) && presentation) {
    output.push(issue('VIEW_PROCESS_ENV_ACCESS', file, 'A presentation réteg közvetlenül process.env értéket olvas.'));
  }

  const secretProp = exportedFunctions(sourceFile)
    .flatMap(({ parameter }) => propsContract(sourceFile, parameter).props)
    .some((name) => /^(?:accessToken|refreshToken|secret|password|credential|apiKey|privateKey)$/iu.test(name));
  if (client && secretProp) {
    output.push(issue('VIEW_SECRET_PROP', file, 'A Client Component props-szerződése secret vagy credential jellegű mezőt tartalmaz.'));
  }

  if (/\{\s*(?:String\s*\(\s*error\s*\)|error\.(?:message|stack|cause))\s*\}/u.test(source)) {
    output.push(issue('VIEW_RAW_ERROR_OUTPUT', file, 'A nézet nyers exceptionüzenetet, cause-t vagy stack trace-t renderel.'));
  }

  if (/\bkey\s*=\s*\{\s*(?:Math\.random\s*\(|crypto\.randomUUID\s*\(|(?:index|idx|i)\s*\})/u.test(source)) {
    output.push(issue('VIEW_UNSTABLE_LIST_KEY', file, 'A lista instabil, random vagy indexalapú React key-t használ.'));
  }

  if (client && /\/src\/app\/(?:.*\/)?(?:page|layout|template)\.(?:tsx|jsx)$/u.test(normalized)) {
    output.push(issue('VIEW_GLOBAL_CLIENT_BOUNDARY', file, 'A Page, Layout vagy template.tsx indokolatlanul magas Client Component határt hoz létre.'));
  }

  const email = normalized.includes('/presentation/email/') || /email\.(?:tsx|jsx)$/u.test(file);
  if (email && (client || /\b(?:useEffect|useLayoutEffect|useState|window|document|localStorage|sessionStorage|navigator)\b/u.test(source))) {
    output.push(issue('VIEW_EMAIL_BROWSER_API', file, 'Az email-template kliens- vagy böngészőspecifikus API-t használ.'));
  }

  if (importsMatching(information.imports, /^@mdx-js\/mdx$/u) && /\b(?:compile|evaluate|run)\s*\(/u.test(source)) {
    output.push(issue('VIEW_UNSAFE_MDX_SOURCE', file, 'A forrás runtime MDX-fordítást végez explicit trust/sanitization boundary nélkül.'));
  }

  if (dynamicImport && /\bfor\s*\([^)]*(?:paths|roots|directories|locations)\b[\s\S]*\b(?:access|stat|readFile)\s*\(/iu.test(source)) {
    output.push(issue('VIEW_NAMESPACE_SHADOWING', file, 'A nézetfeloldás több könyvtárat keres sorrend alapján, így implicit shadowingot enged.'));
  }

  if (normalized.includes('/src/platform/ui/') && (
    importsMatching(information.imports, /(?:^|\/)composition(?:\/|$)|(?:^|\/)application(?:\/|$)|database(?:\/|$)|(?:^|\/)infrastructure(?:\/|$)/iu) ||
    /\bfetch\s*\(/u.test(source)
  )) {
    output.push(issue('VIEW_GENERIC_UI_DATA_ACCESS', file, 'A generic platform UI komponens adat- vagy application-hozzáférést végez.'));
  }

  return output;
}

function missingAltIssues(record: ViewRecord): readonly ViewIssue[] {
  return record.assets.images
    .filter(({ hasAlt }) => !hasAlt)
    .map(() => issue('VIEW_MISSING_IMAGE_ALT', record.file, 'A kép alt attribútum nélkül renderelődik.'));
}

async function testSources(root: string): Promise<readonly Readonly<{ file: string; source: string }>[]> {
  const files = await collect(path.join(root, 'tests'), (name) => TEST_EXTENSION.test(name));
  return Promise.all(files.map(async (absolute) => ({
    file: projectPath(root, absolute),
    source: await readFile(absolute, 'utf8'),
  })));
}

function relatedTests(
  record: Omit<ViewRecord, 'tests'>,
  tests: readonly Readonly<{ file: string; source: string }>[],
): readonly string[] {
  const fileBase = fileStem(record.file);
  const presenterPrefix = fileBase.endsWith('-view') ? fileBase.slice(0, -'-view'.length) : null;
  return tests
    .filter(({ file, source }) => {
      if (!file.includes('/unit/') && !file.startsWith('tests/unit/')) return false;
      if (source.includes(record.name)) return true;
      if (record.viewModels.some((name) => source.includes(name))) return true;
      if (fileBase.includes('-') && source.includes(fileBase)) return true;
      if (presenterPrefix && path.basename(file).startsWith(`${presenterPrefix}.presenter.`)) return true;
      return false;
    })
    .map(({ file }) => file)
    .sort();
}

function componentRecords(
  root: string,
  appRoot: string,
  absolute: string,
  source: string,
  sourceFile: ts.SourceFile,
): readonly Omit<ViewRecord, 'tests'>[] {
  const file = projectPath(root, absolute);
  const routeView = routeKind(absolute, appRoot);
  const email = isEmailComponent(absolute);
  const content = CONTENT_EXTENSION.test(absolute);
  const information = importInformation(sourceFile);
  const assets = assetContract(sourceFile, information);
  const dangerous = /\bdangerouslySetInnerHTML\b/u.test(source);

  if (content) {
    return [{
      kind: 'content',
      name: derivedName(absolute, 'content'),
      file,
      route: null,
      boundary: 'static',
      async: false,
      propsType: null,
      props: [],
      viewModels: [],
      imports: [],
      routeBuilders: [],
      hasDangerousHtml: dangerous,
      assets,
    }];
  }

  if (routeView) {
    const selected = defaultFunction(sourceFile);
    const contract = propsContract(sourceFile, selected?.parameter ?? null);
    return [{
      kind: routeView,
      name: selected?.name ?? derivedName(absolute, routeView),
      file,
      route: routeFor(appRoot, absolute),
      boundary: boundary(sourceFile, routeView),
      async: selected?.async ?? false,
      propsType: contract.propsType,
      props: contract.props,
      viewModels: Object.freeze([...new Set([...information.viewModels, ...referencedViewModels(sourceFile)])].sort()),
      imports: information.imports,
      routeBuilders: information.routeBuilders,
      hasDangerousHtml: dangerous,
      assets,
    }];
  }

  if (!email && !isPresentationComponent(absolute)) return [];
  const exported = exportedFunctions(sourceFile).filter(({ name }) => /^[A-Z]/u.test(name));
  return exported.map((item) => {
    const contract = propsContract(sourceFile, item.parameter);
    return {
      kind: email ? 'email' : 'component',
      name: item.name,
      file,
      route: null,
      boundary: boundary(sourceFile, email ? 'email' : 'component'),
      async: item.async,
      propsType: contract.propsType,
      props: contract.props,
      viewModels: Object.freeze([...new Set([...information.viewModels, ...referencedViewModels(sourceFile)])].sort()),
      imports: information.imports,
      routeBuilders: information.routeBuilders,
      hasDangerousHtml: dangerous,
      assets,
    } satisfies Omit<ViewRecord, 'tests'>;
  });
}

export function inspectViews(inventory: ViewInventory, value: string): readonly ViewRecord[] {
  const normalized = value.trim();
  return inventory.records.filter((record) =>
    record.name === normalized ||
    record.file === normalized ||
    record.route === normalized ||
    record.file.endsWith(`/${normalized}`),
  );
}

export function isViewAssetIssue(issueValue: ViewIssue): boolean {
  return [
    'VIEW_DANGEROUS_HTML',
    'VIEW_MISSING_IMAGE_ALT',
    'VIEW_UNTRUSTED_URL',
  ].includes(issueValue.code);
}

export async function buildViewInventory(root = process.cwd()): Promise<ViewInventory> {
  const appRoot = path.join(root, 'src/app');
  const sourceDirectories = [path.join(root, 'src'), path.join(root, 'content')];
  const sourceFiles = new Set<string>();
  for (const directory of sourceDirectories) {
    for (const file of await collect(directory, (name) => SCRIPT_EXTENSION.test(name) || CONTENT_EXTENSION.test(name))) {
      sourceFiles.add(file);
    }
  }

  const recordPlans: Array<Omit<ViewRecord, 'tests'>> = [];
  const issues: ViewIssue[] = [];
  for (const absolute of [...sourceFiles].sort()) {
    const source = await readFile(absolute, 'utf8');
    const sourceFile = SCRIPT_EXTENSION.test(absolute) ? parse(absolute, source) : parse(`${absolute}.tsx`, '');
    if (VIEW_SOURCE_EXTENSION.test(absolute)) {
      recordPlans.push(...componentRecords(root, appRoot, absolute, source, sourceFile));
    }
    if (SCRIPT_EXTENSION.test(absolute)) {
      issues.push(...inspectSourceIssues(root, absolute, source, sourceFile));
    }
  }

  const tests = await testSources(root);
  const records = recordPlans
    .map((record) => Object.freeze({ ...record, tests: Object.freeze(relatedTests(record, tests)) }))
    .sort((left, right) => {
      const kind = KIND_ORDER[left.kind] - KIND_ORDER[right.kind];
      return kind !== 0 ? kind : left.file.localeCompare(right.file) || left.name.localeCompare(right.name);
    });

  for (const record of records) {
    issues.push(...missingAltIssues(record));
    if (
      record.kind === 'component' &&
      record.file.includes('/presentation/') &&
      /View$/u.test(record.name) &&
      record.props.length > 0 &&
      record.viewModels.length === 0
    ) {
      issues.push(issue('VIEW_MODEL_MISSING', record.file, 'A presentation View explicit ViewModel szerződés nélkül kap propsot.'));
    }
  }

  const unique = new Map<string, ViewIssue>();
  for (const entry of issues) unique.set(`${entry.code}\0${entry.file}\0${entry.message}`, entry);
  const sortedIssues = [...unique.values()].sort((left, right) =>
    left.file.localeCompare(right.file) || left.code.localeCompare(right.code) || left.message.localeCompare(right.message));

  return Object.freeze({
    schemaVersion: 1,
    sourceRoot: await exists(path.join(root, 'src')) ? 'src' : '.',
    records: Object.freeze(records),
    issues: Object.freeze(sortedIssues),
  });
}
