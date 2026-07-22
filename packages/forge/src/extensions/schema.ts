import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  DependencyDeclaration,
  ExtensionIssue,
  ExtensionManifest,
  ExtensionProvider,
  RecipeFileDeclaration,
  RecipeManifest,
  RecipeMigration,
  RecipeOwnership,
} from './types';

const IDENTIFIER = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u;
const CAPABILITY = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;
const OWNERSHIPS = new Set<RecipeOwnership>([
  'generated-read-only',
  'generated-with-regions',
  'consumer-owned-after-create',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function unknownFields(raw: Record<string, unknown>, allowed: readonly string[], file: string, issues: ExtensionIssue[]): void {
  const accepted = new Set(allowed);
  for (const key of Object.keys(raw)) {
    if (!accepted.has(key)) issues.push({ severity: 'error', area: 'manifest', code: 'EXTENSION_MANIFEST_INVALID', file, message: `Ismeretlen mező: ${key}.` });
  }
}

function safeRelative(value: string): boolean {
  if (path.isAbsolute(value) || value.includes('\0')) return false;
  const normalized = path.normalize(value);
  return normalized !== '..' && !normalized.startsWith(`..${path.sep}`) && !path.isAbsolute(normalized);
}

function uniqueStrings(
  raw: unknown,
  file: string,
  field: string,
  issues: ExtensionIssue[],
  pattern: RegExp | null = null,
): readonly string[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    issues.push({ severity: 'error', area: 'manifest', code: 'EXTENSION_MANIFEST_INVALID', file, message: `${field} tömb legyen.` });
    return [];
  }
  const output: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const value = stringValue(item);
    if (!value || (pattern && !pattern.test(value))) {
      issues.push({ severity: 'error', area: 'manifest', code: 'EXTENSION_MANIFEST_INVALID', file, message: `${field} érvénytelen elemet tartalmaz: ${String(item)}.` });
      continue;
    }
    if (seen.has(value)) {
      issues.push({ severity: 'error', area: 'manifest', code: 'EXTENSION_MANIFEST_INVALID', file, message: `${field} duplikált elemet tartalmaz: ${value}.` });
      continue;
    }
    seen.add(value);
    output.push(value);
  }
  return Object.freeze(output.sort());
}

function dependencies(raw: unknown, file: string, field: string, issues: ExtensionIssue[]): readonly DependencyDeclaration[] {
  if (raw === undefined) return [];
  const values = Array.isArray(raw)
    ? raw
    : isRecord(raw)
      ? Object.entries(raw).map(([name, version]) => ({ name, version }))
      : null;
  if (!values) {
    issues.push({ severity: 'error', area: 'manifest', code: 'EXTENSION_MANIFEST_INVALID', file, message: `${field} tömb vagy név-verzió objektum legyen.` });
    return [];
  }
  const output: DependencyDeclaration[] = [];
  const seen = new Set<string>();
  for (const item of values) {
    const name = typeof item === 'string'
      ? item.trim()
      : isRecord(item)
        ? stringValue(item.name)
        : null;
    const version = isRecord(item)
      ? stringValue(item.version)
      : null;
    if (!name || seen.has(name)) {
      issues.push({ severity: 'error', area: 'manifest', code: 'EXTENSION_MANIFEST_INVALID', file, message: `${field} érvénytelen vagy duplikált dependency-t tartalmaz: ${String(name)}.` });
      continue;
    }
    seen.add(name);
    output.push(Object.freeze({ name, version }));
  }
  return Object.freeze(output.sort((left, right) => left.name.localeCompare(right.name)));
}

function recipeFiles(raw: unknown, file: string, issues: ExtensionIssue[]): readonly RecipeFileDeclaration[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    issues.push({ severity: 'error', area: 'recipe', code: 'EXTENSION_RECIPE_INVALID', file, message: 'A files mező tömb legyen.' });
    return [];
  }
  const output: RecipeFileDeclaration[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const target = typeof item === 'string' ? item.trim() : isRecord(item) ? stringValue(item.path) : null;
    const source = typeof item === 'string' ? item.trim() : isRecord(item) ? stringValue(item.source) ?? target : null;
    const rawOwnership = isRecord(item) ? stringValue(item.ownership) : null;
    const ownership = rawOwnership && OWNERSHIPS.has(rawOwnership as RecipeOwnership)
      ? rawOwnership as RecipeOwnership
      : 'generated-read-only';
    if (!target || !source || path.isAbsolute(target) || path.isAbsolute(source) || seen.has(target)) {
      issues.push({ severity: 'error', area: 'recipe', code: 'EXTENSION_RECIPE_INVALID', file, message: `Érvénytelen vagy duplikált recipe fájl: ${String(target)}.` });
      continue;
    }
    if (rawOwnership && !OWNERSHIPS.has(rawOwnership as RecipeOwnership)) {
      issues.push({ severity: 'error', area: 'recipe', code: 'EXTENSION_RECIPE_INVALID', file, message: `Ismeretlen ownership: ${rawOwnership}.` });
      continue;
    }
    seen.add(target);
    output.push(Object.freeze({ path: target, source, ownership }));
  }
  return Object.freeze(output.sort((left, right) => left.path.localeCompare(right.path)));
}

function migrations(raw: unknown, file: string, issues: ExtensionIssue[]): readonly RecipeMigration[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    issues.push({ severity: 'error', area: 'recipe', code: 'EXTENSION_RECIPE_INVALID', file, message: 'A migrations mező tömb legyen.' });
    return [];
  }
  const output: RecipeMigration[] = [];
  for (const item of raw) {
    if (!isRecord(item)) {
      issues.push({ severity: 'error', area: 'recipe', code: 'EXTENSION_RECIPE_INVALID', file, message: 'A migration bejegyzés objektum legyen.' });
      continue;
    }
    const id = stringValue(item.id);
    const from = stringValue(item.from);
    const to = stringValue(item.to);
    if (!id || !from || !to || !SEMVER.test(from) || !SEMVER.test(to)) {
      issues.push({ severity: 'error', area: 'recipe', code: 'EXTENSION_RECIPE_INVALID', file, message: `Érvénytelen migration: ${String(id)}.` });
      continue;
    }
    output.push(Object.freeze({
      id,
      from,
      to,
      destructive: item.destructive === true,
      files: recipeFiles(item.files, file, issues),
    }));
  }
  return Object.freeze(output.sort((left, right) => left.id.localeCompare(right.id)));
}

async function jsonFile(file: string, issues: ExtensionIssue[], area: ExtensionIssue['area']): Promise<Record<string, unknown> | null> {
  let source: string;
  try {
    source = await readFile(file, 'utf8');
  } catch (error) {
    issues.push({ severity: 'error', area, code: area === 'recipe' ? 'EXTENSION_RECIPE_MISSING' : 'EXTENSION_MANIFEST_MISSING', file, message: `A fájl nem olvasható: ${error instanceof Error ? error.message : String(error)}.` });
    return null;
  }
  try {
    const value: unknown = JSON.parse(source);
    if (!isRecord(value)) throw new Error('A JSON gyökere objektum legyen.');
    return value;
  } catch (error) {
    issues.push({ severity: 'error', area, code: area === 'recipe' ? 'EXTENSION_RECIPE_INVALID' : 'EXTENSION_MANIFEST_INVALID', file, message: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

export async function loadRecipeManifest(recipeRoot: string): Promise<Readonly<{ manifest: RecipeManifest | null; issues: readonly ExtensionIssue[] }>> {
  const file = path.join(recipeRoot, 'recipe.json');
  const issues: ExtensionIssue[] = [];
  const raw = await jsonFile(file, issues, 'recipe');
  if (!raw) return { manifest: null, issues };
  unknownFields(raw, ['schemaVersion', 'name', 'version', 'provides', 'requires', 'conflicts', 'dependencies', 'environment', 'configuration', 'files', 'generated', 'migrations'], file, issues);
  const name = stringValue(raw.name);
  const version = stringValue(raw.version) ?? '1.0.0';
  if (raw.schemaVersion !== 1 || !name || !IDENTIFIER.test(name) || !SEMVER.test(version)) {
    issues.push({ severity: 'error', area: 'recipe', code: 'EXTENSION_RECIPE_INVALID', file, message: 'A recipe schemaVersion, name vagy version mezője érvénytelen.' });
  }
  const dependencyRoot = isRecord(raw.dependencies) ? raw.dependencies : {};
  const provides = uniqueStrings(raw.provides, file, 'provides', issues, CAPABILITY);
  const requires = uniqueStrings(raw.requires, file, 'requires', issues, CAPABILITY);
  const conflicts = uniqueStrings(raw.conflicts, file, 'conflicts', issues, CAPABILITY);
  for (const capability of provides) {
    if (conflicts.includes(capability)) issues.push({ severity: 'error', area: 'recipe', code: 'EXTENSION_CAPABILITY_CONFLICT', file, message: `A recipe egyszerre biztosítja és tiltja ezt a capability-t: ${capability}.` });
  }
  const manifest: RecipeManifest = Object.freeze({
    schemaVersion: 1,
    name: name ?? '<invalid>',
    version,
    provides,
    requires,
    conflicts,
    dependencies: Object.freeze({
      runtime: dependencies(dependencyRoot.runtime, file, 'dependencies.runtime', issues),
      development: dependencies(dependencyRoot.development, file, 'dependencies.development', issues),
    }),
    environment: uniqueStrings(raw.environment, file, 'environment', issues),
    configuration: Object.freeze(Array.isArray(raw.configuration) ? raw.configuration.filter(isRecord).map((item) => Object.freeze({ ...item })) : []),
    files: recipeFiles(raw.files, file, issues),
    generated: uniqueStrings(raw.generated, file, 'generated', issues),
    migrations: migrations(raw.migrations, file, issues),
  });
  return { manifest: issues.some(({ severity }) => severity === 'error') ? null : manifest, issues: Object.freeze(issues) };
}

function providers(raw: unknown, file: string, issues: ExtensionIssue[]): readonly ExtensionProvider[] {
  if (raw === undefined) return [];
  const records = Array.isArray(raw)
    ? raw
    : isRecord(raw)
      ? Object.entries(raw).map(([contract, value]) => isRecord(value) ? { ...value, contract } : value)
      : null;
  if (!records) {
    issues.push({ severity: 'error', area: 'manifest', code: 'EXTENSION_MANIFEST_INVALID', file, message: 'A providers mező tömb vagy objektum legyen.' });
    return [];
  }
  const output: ExtensionProvider[] = [];
  const ids = new Set<string>();
  for (const item of records) {
    if (!isRecord(item)) continue;
    const id = stringValue(item.id) ?? stringValue(item.default);
    const contract = stringValue(item.contract);
    const packageName = stringValue(item.package) ?? id;
    if (!id || !contract || !packageName || ids.has(id)) {
      issues.push({ severity: 'error', area: 'manifest', code: 'EXTENSION_MANIFEST_INVALID', file, message: `A provider id, contract és package mezője kötelező és az id legyen egyedi: ${String(id)}.` });
      continue;
    }
    ids.add(id);
    output.push(Object.freeze({ id, contract, package: packageName, required: item.required !== false, default: item.default === true || typeof item.default === 'string' }));
  }
  const contracts = new Set(output.map(({ contract }) => contract));
  for (const contract of contracts) {
    const entries = output.filter((item) => item.contract === contract);
    const defaults = entries.filter((item) => item.default);
    if (defaults.length > 1 || (entries.filter((item) => item.required).length > 1 && defaults.length !== 1)) {
      issues.push({ severity: 'error', area: 'manifest', code: 'EXTENSION_PROVIDER_AMBIGUOUS', file, message: `A(z) ${contract} provider-választása nem egyértelmű.` });
    }
  }
  return Object.freeze(output.sort((left, right) => left.id.localeCompare(right.id)));
}

export async function loadExtensionManifest(sourceRoot: string): Promise<Readonly<{ manifest: ExtensionManifest | null; issues: readonly ExtensionIssue[] }>> {
  const candidates = ['extension.json', 'winzard-extension.json'];
  const issues: ExtensionIssue[] = [];
  let file: string | null = null;
  let raw: Record<string, unknown> | null = null;
  for (const candidate of candidates) {
    const candidateFile = path.join(sourceRoot, candidate);
    try {
      await readFile(candidateFile, 'utf8');
      file = candidateFile;
      raw = await jsonFile(candidateFile, issues, 'manifest');
      break;
    } catch {
      // Try the next canonical file name.
    }
  }
  if (!file || !raw) {
    issues.push({ severity: 'error', area: 'manifest', code: 'EXTENSION_MANIFEST_MISSING', file: sourceRoot, message: 'Hiányzik az extension.json vagy winzard-extension.json.' });
    return { manifest: null, issues: Object.freeze(issues) };
  }
  unknownFields(raw, ['schemaVersion', 'name', 'displayName', 'version', 'stability', 'provides', 'requires', 'conflicts', 'packages', 'providers', 'recipe', 'documentation', 'compatibility'], file, issues);
  const name = stringValue(raw.name);
  const version = stringValue(raw.version);
  const stability = raw.stability === 'stable' || raw.stability === 'deprecated' ? raw.stability : 'experimental';
  if (raw.schemaVersion !== 1 || !name || !IDENTIFIER.test(name) || !version || !SEMVER.test(version)) {
    issues.push({ severity: 'error', area: 'manifest', code: 'EXTENSION_MANIFEST_INVALID', file, message: 'Az extension schemaVersion, name vagy version mezője érvénytelen.' });
  }
  const packageRoot = isRecord(raw.packages) ? raw.packages : {};
  const recipeRoot = isRecord(raw.recipe) ? raw.recipe : null;
  const documentationRoot = isRecord(raw.documentation) ? raw.documentation : null;
  const compatibilityRoot = isRecord(raw.compatibility) ? raw.compatibility : {};
  const provides = uniqueStrings(raw.provides, file, 'provides', issues, CAPABILITY);
  const requires = uniqueStrings(raw.requires, file, 'requires', issues, CAPABILITY);
  const conflicts = uniqueStrings(raw.conflicts, file, 'conflicts', issues, CAPABILITY);
  for (const capability of provides) {
    if (conflicts.includes(capability)) issues.push({ severity: 'error', area: 'capability', code: 'EXTENSION_CAPABILITY_CONFLICT', file, message: `Az extension egyszerre biztosítja és tiltja ezt a capability-t: ${capability}.` });
  }
  const recipeName = recipeRoot ? stringValue(recipeRoot.name) : null;
  const recipeVersion = recipeRoot ? stringValue(recipeRoot.version) : null;
  const recipePath = recipeRoot ? stringValue(recipeRoot.path) ?? `recipes/${recipeName ?? ''}` : null;
  if (recipeVersion && !SEMVER.test(recipeVersion)) issues.push({ severity: 'error', area: 'manifest', code: 'EXTENSION_MANIFEST_INVALID', file, message: 'A recipe verziója érvényes semver legyen.' });
  if (recipePath && !safeRelative(recipePath)) issues.push({ severity: 'error', area: 'security', code: 'EXTENSION_PATH_ESCAPE', file, message: `A recipe path a forrásgyökéren belül maradjon: ${recipePath}.` });
  const documentationEntry = documentationRoot ? stringValue(documentationRoot.entry) : null;
  const consumerPack = documentationRoot ? stringValue(documentationRoot.consumerPack) : null;
  for (const documentationPath of [documentationEntry, consumerPack]) {
    if (documentationPath && !safeRelative(documentationPath)) issues.push({ severity: 'error', area: 'security', code: 'EXTENSION_PATH_ESCAPE', file, message: `A dokumentációs path a forrásgyökéren belül maradjon: ${documentationPath}.` });
  }
  const manifest: ExtensionManifest = Object.freeze({
    schemaVersion: 1,
    name: name ?? '<invalid>',
    displayName: stringValue(raw.displayName) ?? name ?? '<invalid>',
    version: version ?? '0.0.0',
    stability,
    provides,
    requires,
    conflicts,
    packages: Object.freeze({
      runtime: dependencies(packageRoot.runtime, file, 'packages.runtime', issues),
      development: dependencies(packageRoot.development, file, 'packages.development', issues),
      peer: dependencies(packageRoot.peer, file, 'packages.peer', issues),
    }),
    providers: providers(raw.providers, file, issues),
    recipe: recipeRoot && recipeName && recipeVersion && recipePath
      ? Object.freeze({ name: recipeName, version: recipeVersion, path: recipePath })
      : null,
    documentation: documentationEntry
      ? Object.freeze({ entry: documentationEntry, consumerPack })
      : null,
    compatibility: Object.freeze({
      node: stringValue(compatibilityRoot.node),
      pnpm: stringValue(compatibilityRoot.pnpm),
      next: stringValue(compatibilityRoot.next),
      react: stringValue(compatibilityRoot.react),
    }),
    sourceRoot: path.resolve(sourceRoot),
    sourceFile: file,
  });
  if (manifest.recipe === null && recipeRoot !== null) {
    issues.push({ severity: 'error', area: 'manifest', code: 'EXTENSION_MANIFEST_INVALID', file, message: 'A recipe name, version és path mezője kötelező.' });
  }
  return { manifest: issues.some(({ severity }) => severity === 'error') ? null : manifest, issues: Object.freeze(issues) };
}
