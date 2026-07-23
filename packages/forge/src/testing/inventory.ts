import { createHash } from 'node:crypto';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import ts from 'typescript';

import type {
  TestDurationClass,
  TestLayer,
  TestNetworkPolicy,
  TestQuarantineRecord,
  TestRuntime,
  TestSuiteRecord,
  TestingInventory,
  TestingIssue,
} from './types';

const DEFINITION_FILES = ['testing.definition.ts', 'testing.definition.mts'] as const;
const TEST_FILE = /\.(?:test|spec|smoke)\.(?:ts|tsx|js|jsx|mts|cts|mjs|cjs)$/u;
const SOURCE_FILE = /\.(?:ts|tsx|js|jsx|mts|cts|mjs|cjs)$/u;
const IGNORED_DIRECTORIES = new Set(['node_modules', '.next', 'coverage', 'generated', 'test-results', 'playwright-report', 'fixtures']);
const SUITE_ID = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u;
const OWNER = /^(?:team|package|app|template):[a-z0-9][a-z0-9._-]*$/u;
const TEST_LAYERS = new Set<TestLayer>(['unit', 'contract', 'integration', 'application-http', 'browser-e2e', 'accessibility', 'visual']);
const TEST_RUNTIMES = new Set<TestRuntime>(['node', 'jsdom', 'postgresql', 'browser']);
const NETWORK_POLICIES = new Set<TestNetworkPolicy>(['blocked', 'allowlisted', 'uncontrolled']);
const DURATION_CLASSES = new Set<TestDurationClass>(['fast', 'medium', 'slow']);

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
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
    const current = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collect(current, predicate));
    else if (entry.isFile() && predicate(entry.name)) files.push(current);
  }
  return files.sort();
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current)
  ) current = current.expression;
  return current;
}

function propertyName(name: ts.PropertyName): string | null {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name) ? name.text : null;
}

function literalValue(expression: ts.Expression): unknown {
  const current = unwrapExpression(expression);
  if (ts.isStringLiteral(current) || ts.isNoSubstitutionTemplateLiteral(current)) return current.text;
  if (ts.isNumericLiteral(current)) return Number(current.text);
  if (current.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (current.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (current.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isArrayLiteralExpression(current)) return current.elements.map((item) => literalValue(item as ts.Expression));
  if (ts.isObjectLiteralExpression(current)) {
    const output: Record<string, unknown> = {};
    for (const property of current.properties) {
      if (!ts.isPropertyAssignment(property)) continue;
      const name = propertyName(property.name);
      if (name !== null) output[name] = literalValue(property.initializer);
    }
    return output;
  }
  return undefined;
}

function definitionObject(sourceFile: ts.SourceFile): Record<string, unknown> | null {
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!declaration.initializer) continue;
      const initializer = unwrapExpression(declaration.initializer);
      if (!ts.isCallExpression(initializer)) continue;
      if (!ts.isIdentifier(initializer.expression) || initializer.expression.text !== 'defineTestingContract') continue;
      const value = initializer.arguments[0] ? literalValue(initializer.arguments[0]) : null;
      return isRecord(value) ? value : null;
    }
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function stringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  return Object.freeze(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean));
}

function booleanValue(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function issue(code: string, file: string, message: string, severity: TestingIssue['severity'] = 'error', suiteId?: string): TestingIssue {
  return Object.freeze({ severity, code, file, message, ...(suiteId ? { suiteId } : {}) });
}

function globExpression(glob: string): RegExp {
  let output = '^';
  for (let index = 0; index < glob.length; index += 1) {
    const character = glob[index] ?? '';
    const next = glob[index + 1] ?? '';
    if (character === '*' && next === '*') {
      output += '.*';
      index += 1;
    } else if (character === '*') output += '[^/]*';
    else if (character === '?') output += '[^/]';
    else output += character.replace(/[|\\{}()[\]^$+?.]/gu, '\\$&');
  }
  return new RegExp(`${output}$`, 'u');
}

function matchesAny(file: string, globs: readonly string[]): boolean {
  return globs.some((glob) => globExpression(glob).test(file));
}

function suiteRecord(raw: unknown, file: string, testFiles: readonly string[], issues: TestingIssue[]): TestSuiteRecord | null {
  if (!isRecord(raw)) {
    issues.push(issue('TEST_SUITE_CONTRACT_INVALID', file, 'A testing suite definíció objektum legyen.'));
    return null;
  }
  const id = stringValue(raw.id) ?? '<unknown>';
  const owner = stringValue(raw.owner) ?? '';
  const layer = stringValue(raw.layer);
  const runtime = stringValue(raw.runtime);
  const command = stringValue(raw.command) ?? '';
  const include = stringArray(raw.include);
  const sources = stringArray(raw.sources);
  const fixtures = stringArray(raw.fixtures);
  const capabilities = stringArray(raw.capabilities);
  const services = stringArray(raw.services);
  const ciJob = stringValue(raw.ciJob) ?? '';
  const duration = stringValue(raw.duration);
  const network = stringValue(raw.network);

  if (!SUITE_ID.test(id)) issues.push(issue('TEST_SUITE_ID_INVALID', file, `Érvénytelen suite ID: ${id}.`, 'error', id));
  if (!OWNER.test(owner)) issues.push(issue('TEST_SUITE_OWNER_INVALID', file, `Érvénytelen suite owner: ${owner || '<empty>'}.`, 'error', id));
  if (!layer || !TEST_LAYERS.has(layer as TestLayer)) issues.push(issue('TEST_SUITE_LAYER_INVALID', file, `Nem támogatott test layer: ${String(layer)}.`, 'error', id));
  if (!runtime || !TEST_RUNTIMES.has(runtime as TestRuntime)) issues.push(issue('TEST_SUITE_RUNTIME_INVALID', file, `Nem támogatott test runtime: ${String(runtime)}.`, 'error', id));
  if (!duration || !DURATION_CLASSES.has(duration as TestDurationClass)) issues.push(issue('TEST_SUITE_DURATION_INVALID', file, `Nem támogatott duration class: ${String(duration)}.`, 'error', id));
  if (!network || !NETWORK_POLICIES.has(network as TestNetworkPolicy)) issues.push(issue('TEST_SUITE_NETWORK_INVALID', file, `Nem támogatott network policy: ${String(network)}.`, 'error', id));
  if (command === '') issues.push(issue('TEST_SUITE_COMMAND_MISSING', file, 'A suite command mezője kötelező.', 'error', id));
  if (include.length === 0) issues.push(issue('TEST_GLOB_EMPTY', file, 'A suite legalább egy include globot igényel.', 'error', id));
  if (ciJob === '') issues.push(issue('TEST_SUITE_CI_JOB_MISSING', file, 'A suite CI job mezője kötelező.', 'error', id));

  const discoveredFiles = Object.freeze(testFiles.filter((testFile) => matchesAny(testFile, include)));
  if (include.length > 0 && discoveredFiles.length === 0) {
    issues.push(issue('TEST_GLOB_EMPTY', file, `A ${id} suite include globjai nem találtak tesztfájlt.`, 'error', id));
  }

  const productionBuild = booleanValue(raw.productionBuild);
  const healthcheck = stringValue(raw.healthcheck);
  const resolvedLayer = layer as TestLayer;
  const resolvedRuntime = runtime as TestRuntime;
  const resolvedNetwork = network as TestNetworkPolicy;
  if ((resolvedLayer === 'browser-e2e' || resolvedLayer === 'accessibility' || resolvedLayer === 'visual') && !productionBuild) {
    issues.push(issue('TEST_BROWSER_PRODUCTION_BUILD_MISSING', file, `A ${id} browser suite production buildet igényel.`, 'error', id));
  }
  if ((resolvedLayer === 'browser-e2e' || resolvedLayer === 'accessibility' || resolvedLayer === 'visual' || resolvedLayer === 'application-http') && !healthcheck) {
    issues.push(issue('TEST_E2E_HEALTHCHECK_MISSING', file, `A ${id} application/browser suite healthcheck URL-t igényel.`, 'error', id));
  }
  if ((resolvedLayer === 'browser-e2e' || resolvedLayer === 'accessibility' || resolvedLayer === 'visual' || resolvedLayer === 'integration') && resolvedNetwork === 'uncontrolled') {
    issues.push(issue('TEST_EXTERNAL_NETWORK_UNCONTROLLED', file, `A ${id} suite külső hálózata nincs kontrollálva.`, 'error', id));
  }

  return Object.freeze({
    id,
    owner,
    layer: resolvedLayer,
    runtime: resolvedRuntime,
    command,
    include,
    sources,
    fixtures,
    capabilities,
    services,
    ciJob,
    duration: duration as TestDurationClass,
    serial: booleanValue(raw.serial),
    productionBuild,
    healthcheck,
    network: resolvedNetwork,
    coverage: booleanValue(raw.coverage),
    discoveredFiles,
  });
}

function quarantineRecord(raw: unknown, file: string, issues: TestingIssue[]): TestQuarantineRecord | null {
  if (!isRecord(raw)) {
    issues.push(issue('TEST_QUARANTINE_INVALID', file, 'A quarantine bejegyzés objektum legyen.'));
    return null;
  }
  const testId = stringValue(raw.testId);
  const owner = stringValue(raw.owner);
  const issueReference = stringValue(raw.issue);
  const reason = stringValue(raw.reason);
  const expires = stringValue(raw.expires);
  if (!testId || !owner || !issueReference || !reason || !expires || Number.isNaN(Date.parse(expires))) {
    issues.push(issue('TEST_QUARANTINE_INVALID', file, 'A quarantine testId, owner, issue, reason és ISO expires mezőt igényel.'));
    return null;
  }
  if (Date.parse(expires) < Date.now()) issues.push(issue('TEST_QUARANTINE_EXPIRED', file, `Lejárt quarantine: ${testId} (${expires}).`));
  return Object.freeze({ testId, owner, issue: issueReference, reason, expires });
}

function scanTestSource(file: string, source: string): readonly TestingIssue[] {
  const issues: TestingIssue[] = [];
  if (/\b(?:it|test|describe)\.only\s*\(/u.test(source)) issues.push(issue('TEST_ONLY_COMMITTED', file, 'Commitolt focused test található.'));
  if (/\b(?:it|test|describe)\.skip\s*\(/u.test(source) && !/@skip-reason\s+\S/u.test(source)) {
    issues.push(issue('TEST_SKIP_UNJUSTIFIED', file, 'A skiphez @skip-reason indoklás szükséges.'));
  }
  if (/\b(?:page\.)?waitForTimeout\s*\(/u.test(source) || /new\s+Promise\s*\(.*setTimeout/su.test(source)) {
    issues.push(issue('TEST_FIXED_SLEEP_USED', file, 'Fix időalapú várakozás található a tesztben.', 'warning'));
  }
  if (/\.env\.local\b/u.test(source)) issues.push(issue('TEST_ENV_LOCAL_DEPENDENCY', file, 'A teszt nem függhet .env.local fájltól.'));
  return Object.freeze(issues);
}

async function definitionPath(root: string): Promise<string | null> {
  for (const name of DEFINITION_FILES) {
    const candidate = path.join(root, name);
    if (await exists(candidate)) return candidate;
  }
  return null;
}

export async function buildTestingInventory(root: string): Promise<TestingInventory> {
  const absoluteRoot = path.resolve(root);
  const filePath = await definitionPath(absoluteRoot);
  const testFiles = (await collect(absoluteRoot, (name) => TEST_FILE.test(name))).map((value) => projectPath(absoluteRoot, value));
  const issues: TestingIssue[] = [];
  const suites: TestSuiteRecord[] = [];
  const quarantine: TestQuarantineRecord[] = [];

  if (!filePath) issues.push(issue('TEST_SUITE_UNREGISTERED', 'testing.definition.ts', 'A projektből hiányzik a testing.definition.ts contract.'));
  else {
    const source = await readFile(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(projectPath(absoluteRoot, filePath), source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const raw = definitionObject(sourceFile);
    if (!raw || raw.schemaVersion !== 1 || !Array.isArray(raw.suites)) {
      issues.push(issue('TEST_DEFINITION_INVALID', projectPath(absoluteRoot, filePath), 'Statikus, 1-es schemaVersionű defineTestingContract contract szükséges.'));
    } else {
      for (const value of raw.suites) {
        const suite = suiteRecord(value, projectPath(absoluteRoot, filePath), testFiles, issues);
        if (suite) suites.push(suite);
      }
      if (Array.isArray(raw.quarantine)) {
        for (const value of raw.quarantine) {
          const record = quarantineRecord(value, projectPath(absoluteRoot, filePath), issues);
          if (record) quarantine.push(record);
        }
      }
    }
  }

  const ids = new Set<string>();
  for (const suite of suites) {
    if (ids.has(suite.id)) issues.push(issue('TEST_SUITE_DUPLICATE', filePath ? projectPath(absoluteRoot, filePath) : 'testing.definition.ts', `Duplikált suite ID: ${suite.id}.`, 'error', suite.id));
    ids.add(suite.id);
    for (const fixture of suite.fixtures) {
      if (!await exists(path.join(absoluteRoot, fixture))) issues.push(issue('TEST_FIXTURE_MISSING', fixture, `A ${suite.id} suite fixture-e nem található.`, 'error', suite.id));
    }
  }

  const registered = new Set(suites.flatMap(({ discoveredFiles }) => discoveredFiles));
  const unregisteredTestFiles = Object.freeze(testFiles.filter((file) => !registered.has(file)));
  for (const file of unregisteredTestFiles) issues.push(issue('TEST_FILE_NOT_DISCOVERED', file, 'A tesztfájlt egyetlen regisztrált suite sem futtatja.'));

  for (const absoluteFile of await collect(absoluteRoot, (name) => SOURCE_FILE.test(name) && TEST_FILE.test(name))) {
    const file = projectPath(absoluteRoot, absoluteFile);
    issues.push(...scanTestSource(file, await readFile(absoluteFile, 'utf8')));
  }

  const normalized = JSON.stringify({
    schemaVersion: 1,
    suites: suites.map(({ discoveredFiles, ...suite }) => ({ ...suite, discoveredFiles: [...discoveredFiles] })),
    quarantine,
    unregisteredTestFiles,
    issues: issues.map(({ severity, code, file, message, suiteId }) => ({ severity, code, file, message, suiteId: suiteId ?? null })),
  });
  return Object.freeze({
    schemaVersion: 1,
    sourceRoot: absoluteRoot,
    definitionFile: filePath ? projectPath(absoluteRoot, filePath) : null,
    suites: Object.freeze(suites),
    quarantine: Object.freeze(quarantine),
    unregisteredTestFiles,
    issues: Object.freeze(issues),
    fingerprint: createHash('sha256').update(normalized).digest('hex'),
  });
}

export function inspectTestingSuites(inventory: TestingInventory, value: string): readonly TestSuiteRecord[] {
  const query = value.trim().toLowerCase();
  return inventory.suites.filter((suite) =>
    suite.id.toLowerCase().includes(query) ||
    suite.owner.toLowerCase().includes(query) ||
    suite.layer.includes(query) ||
    suite.runtime.includes(query) ||
    suite.discoveredFiles.some((file) => file.toLowerCase().includes(query)));
}

export function impactedTestingSuites(inventory: TestingInventory, changedFiles: readonly string[]): readonly TestSuiteRecord[] {
  if (changedFiles.length === 0) return inventory.suites;
  const normalized = changedFiles.map((file) => file.split(path.sep).join('/'));
  const globalChange = normalized.some((file) => /^(?:package\.json|pnpm-lock\.yaml|tsconfig|vitest|playwright|\.github\/workflows)/u.test(file));
  if (globalChange) return inventory.suites;
  const impacted = inventory.suites.filter((suite) => normalized.some((file) =>
    suite.discoveredFiles.includes(file) || matchesAny(file, suite.sources) || matchesAny(file, suite.fixtures)));
  return impacted.length > 0 ? impacted : inventory.suites;
}
