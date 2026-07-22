import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { knownCapabilities, loadProjectManifest } from '../manifest';
import { loadRecipeManifest } from './schema';
import { assertNoSymlinkEscape, exists, loadExtensionState, repositoryPath, writeExtensionState } from './state';
import type {
  DependencyDeclaration,
  ExtensionIssue,
  ExtensionManifest,
  InstalledExtensionState,
  InstalledFileState,
  RecipeFileDeclaration,
  RecipeManifest,
  RecipePlan,
  RecipePlanOperation,
} from './types';

const STATE_FILE = '.winzard/state/extensions.json';
const sha256 = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');

async function fileHash(file: string): Promise<string | null> {
  try { return sha256(await readFile(file)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}

async function readPackage(root: string): Promise<Record<string, unknown>> {
  const value: unknown = JSON.parse(await readFile(repositoryPath(root, 'package.json'), 'utf8'));
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('PROJECT_PACKAGE_INVALID');
  return value as Record<string, unknown>;
}

function dependencyMap(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}

async function nearestPackage(start: string): Promise<Record<string, unknown>> {
  let current = path.resolve(start);
  while (true) {
    try {
      const value: unknown = JSON.parse(await readFile(path.join(current, 'package.json'), 'utf8'));
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value as Record<string, unknown>;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const parent = path.dirname(current);
    if (parent === current) return {};
    current = parent;
  }
}

function resolvedDependencies(declarations: readonly DependencyDeclaration[], fallback: Readonly<Record<string, string>>): readonly DependencyDeclaration[] {
  const output = new Map<string, string | null>();
  for (const declaration of declarations) {
    const current = output.get(declaration.name) ?? null;
    output.set(declaration.name, declaration.version ?? current ?? fallback[declaration.name] ?? null);
  }
  return Object.freeze([...output].sort(([left], [right]) => left.localeCompare(right)).map(([name, version]) => Object.freeze({ name, version })));
}

function dependencyOperations(
  declarations: readonly DependencyDeclaration[],
  installed: Readonly<Record<string, string>>,
  development: boolean,
  issues: ExtensionIssue[],
  file: string,
): RecipePlanOperation[] {
  const output: RecipePlanOperation[] = [];
  for (const declaration of declarations) {
    if (installed[declaration.name] !== undefined) continue;
    if (!declaration.version) {
      issues.push({ severity: 'error', area: 'recipe', code: 'EXTENSION_DEPENDENCY_VERSION_MISSING', file, message: `${declaration.name} dependency verziója hiányzik.` });
      continue;
    }
    output.push(Object.freeze({
      kind: development ? 'add-development-dependency' : 'add-runtime-dependency',
      name: declaration.name,
      version: declaration.version,
    }));
  }
  return output;
}

async function expand(recipeRoot: string, declaration: RecipeFileDeclaration): Promise<readonly RecipeFileDeclaration[]> {
  const source = repositoryPath(path.join(recipeRoot, 'files'), declaration.source);
  const info = await stat(source);
  if (info.isFile()) return [declaration];
  if (!info.isDirectory()) return [];
  const output: RecipeFileDeclaration[] = [];
  const visit = async (directory: string, relative: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const child = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await visit(path.join(directory, entry.name), child);
      else if (entry.isFile()) output.push(Object.freeze({
        path: `${declaration.path.replace(/\/$/u, '')}/${child}`,
        source: `${declaration.source.replace(/\/$/u, '')}/${child}`,
        ownership: declaration.ownership,
      }));
    }
  };
  await visit(source, '');
  return Object.freeze(output.sort((left, right) => left.path.localeCompare(right.path)));
}

function migrationChain(recipe: RecipeManifest, from: string, to: string): readonly RecipeManifest['migrations'][number][] | null {
  if (from === to) return [];
  const queue: { version: string; chain: readonly RecipeManifest['migrations'][number][] }[] = [{ version: from, chain: [] }];
  const visited = new Set([from]);
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    for (const migration of recipe.migrations.filter((item) => item.from === current.version)) {
      const chain = [...current.chain, migration];
      if (migration.to === to) return Object.freeze(chain);
      if (!visited.has(migration.to)) { visited.add(migration.to); queue.push({ version: migration.to, chain }); }
    }
  }
  return null;
}

function invalidPlan(projectRoot: string, recipeRoot: string, extension: ExtensionManifest | null, issues: readonly ExtensionIssue[]): RecipePlan {
  return Object.freeze({
    extension,
    recipe: Object.freeze({ schemaVersion: 1, name: '<invalid>', version: '0.0.0', provides: [], requires: [], conflicts: [], dependencies: { runtime: [], development: [] }, environment: [], configuration: [], files: [], generated: [], migrations: [] }),
    projectRoot: path.resolve(projectRoot),
    sourceRoot: path.resolve(recipeRoot),
    operations: [], issues, unchanged: [], migrations: [],
  });
}

export async function planRecipe(projectRoot: string, recipeRoot: string, extension: ExtensionManifest | null = null): Promise<RecipePlan> {
  const loaded = await loadRecipeManifest(recipeRoot);
  if (!loaded.manifest) return invalidPlan(projectRoot, recipeRoot, extension, loaded.issues);
  const recipe = loaded.manifest;
  const issues: ExtensionIssue[] = [...loaded.issues];
  const operations: RecipePlanOperation[] = [];
  const unchanged: string[] = [];
  const project = await loadProjectManifest(projectRoot);
  if (!project.manifest) issues.push(...project.failures.map(({ code, file, message }) => ({ severity: 'error' as const, area: 'manifest' as const, code, file, message })));
  const state = await loadExtensionState(projectRoot);
  const active = new Set([...(project.manifest?.capabilities ?? []), ...state.extensions.flatMap((item) => item.capabilities)]);
  for (const required of recipe.requires) if (!active.has(required) && !recipe.provides.includes(required)) issues.push({ severity: 'error', area: 'capability', code: 'EXTENSION_CAPABILITY_UNKNOWN', file: 'winzard manifest', message: `${recipe.name} megköveteli: ${required}.` });
  for (const conflict of recipe.conflicts) if (active.has(conflict)) issues.push({ severity: 'error', area: 'capability', code: 'EXTENSION_CAPABILITY_CONFLICT', file: 'winzard manifest', message: `${recipe.name} ütközik ezzel: ${conflict}.` });
  for (const capability of recipe.provides) if (!active.has(capability)) operations.push(Object.freeze({ kind: 'add-capability', capability }));

  const packageJson = await readPackage(projectRoot);
  const sourcePackage = await nearestPackage(recipeRoot);
  const recipeFile = path.join(recipeRoot, 'recipe.json');
  operations.push(...dependencyOperations(
    resolvedDependencies([...recipe.dependencies.runtime, ...(extension?.packages.runtime ?? [])], dependencyMap(sourcePackage.dependencies)),
    dependencyMap(packageJson.dependencies),
    false,
    issues,
    recipeFile,
  ));
  operations.push(...dependencyOperations(
    resolvedDependencies([...recipe.dependencies.development, ...(extension?.packages.development ?? [])], dependencyMap(sourcePackage.devDependencies)),
    dependencyMap(packageJson.devDependencies),
    true,
    issues,
    recipeFile,
  ));

  const name = extension?.name ?? recipe.name;
  const previous = state.extensions.find((item) => item.name === name) ?? null;
  const targetVersion = extension?.version ?? recipe.version;
  const migrations = previous ? migrationChain(recipe, previous.version, targetVersion) : [];
  if (previous && previous.version !== targetVersion && migrations === null) issues.push({ severity: 'error', area: 'recipe', code: 'EXTENSION_RECIPE_MIGRATION_MISSING', file: recipeFile, message: `${previous.version} -> ${targetVersion} migration chain hiányzik.` });
  for (const migration of migrations ?? []) if (migration.destructive) issues.push({ severity: 'error', area: 'recipe', code: 'EXTENSION_MIGRATION_UNAPPROVED', file: recipeFile, message: `Külön jóváhagyást igényel: ${migration.id}.` });

  const previousFiles = new Map(previous?.files.map((item) => [item.path, item]) ?? []);
  const declarations = [...recipe.files, ...(migrations ?? []).flatMap((item) => item.files)];
  for (const declaration of declarations) {
    let entries: readonly RecipeFileDeclaration[];
    try { entries = await expand(recipeRoot, declaration); }
    catch (error) {
      const escape = typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'EXTENSION_PATH_ESCAPE';
      issues.push({ severity: 'error', area: escape ? 'security' : 'recipe', code: escape ? 'EXTENSION_PATH_ESCAPE' : 'EXTENSION_RECIPE_FILE_MISSING', file: declaration.source, message: error instanceof Error ? error.message : String(error) });
      continue;
    }
    for (const entry of entries) {
      let source: string;
      let target: string;
      try {
        source = repositoryPath(path.join(recipeRoot, 'files'), entry.source);
        target = repositoryPath(projectRoot, entry.path);
        await assertNoSymlinkEscape(projectRoot, target);
      } catch (error) {
        issues.push({ severity: 'error', area: 'security', code: 'EXTENSION_PATH_ESCAPE', file: entry.path, message: error instanceof Error ? error.message : String(error) });
        continue;
      }
      const sourceHash = await fileHash(source);
      if (!sourceHash) { issues.push({ severity: 'error', area: 'recipe', code: 'EXTENSION_RECIPE_FILE_MISSING', file: entry.source, message: 'A recipe forrásfájl hiányzik.' }); continue; }
      const currentHash = await fileHash(target);
      const owned = previousFiles.get(entry.path);
      if (currentHash === sourceHash && owned) { unchanged.push(entry.path); continue; }
      if (currentHash === null) { operations.push(Object.freeze({ kind: 'create-file', path: entry.path, source: entry.source, ownership: entry.ownership, sourceHash, previousHash: null })); continue; }
      if (!owned && currentHash === sourceHash) { operations.push(Object.freeze({ kind: 'update-file', path: entry.path, source: entry.source, ownership: entry.ownership, sourceHash, previousHash: currentHash })); continue; }
      if (!owned) { issues.push({ severity: 'error', area: 'recipe', code: entry.path.startsWith('src/app/') ? 'EXTENSION_ROUTE_COLLISION' : 'EXTENSION_RECIPE_CONFLICT', file: entry.path, message: 'A célfájl már létezik ownership state nélkül.' }); continue; }
      if (owned.outputHash !== currentHash) { issues.push({ severity: 'error', area: 'recipe', code: 'EXTENSION_RECIPE_DRIFT', file: entry.path, message: 'A recipe-owned fájl kézzel módosult.' }); continue; }
      if (entry.ownership === 'consumer-owned-after-create') { unchanged.push(entry.path); continue; }
      if (entry.ownership === 'generated-with-regions') { issues.push({ severity: 'error', area: 'recipe', code: 'EXTENSION_RECIPE_REGION_CONFLICT', file: entry.path, message: 'Marker metadata nélkül nem frissíthető.' }); continue; }
      operations.push(Object.freeze({ kind: 'update-file', path: entry.path, source: entry.source, ownership: entry.ownership, sourceHash, previousHash: currentHash }));
    }
  }
  return Object.freeze({ extension, recipe, projectRoot: path.resolve(projectRoot), sourceRoot: path.resolve(recipeRoot), operations: Object.freeze(operations), issues: Object.freeze(issues.sort((a, b) => a.file.localeCompare(b.file) || a.code.localeCompare(b.code))), unchanged: Object.freeze(unchanged.sort()), migrations: Object.freeze((migrations ?? []).map(({ id }) => id)) });
}

async function updatePackage(root: string, operations: readonly RecipePlanOperation[]): Promise<void> {
  if (!operations.some(({ kind }) => kind.includes('dependency'))) return;
  const file = repositoryPath(root, 'package.json');
  const raw = await readPackage(root);
  const runtime = dependencyMap(raw.dependencies);
  const development = dependencyMap(raw.devDependencies);
  for (const operation of operations) {
    if (operation.kind === 'add-runtime-dependency') runtime[operation.name] = operation.version;
    if (operation.kind === 'add-development-dependency') development[operation.name] = operation.version;
    if (operation.kind === 'remove-runtime-dependency') delete runtime[operation.name];
    if (operation.kind === 'remove-development-dependency') delete development[operation.name];
  }
  raw.dependencies = Object.fromEntries(Object.entries(runtime).sort(([a], [b]) => a.localeCompare(b)));
  raw.devDependencies = Object.fromEntries(Object.entries(development).sort(([a], [b]) => a.localeCompare(b)));
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(raw, null, 2)}\n`, 'utf8'); await rename(temporary, file);
}

async function updateCapabilities(root: string, operations: readonly RecipePlanOperation[]): Promise<void> {
  const changes = operations.filter((operation): operation is Extract<RecipePlanOperation, { capability: string }> => (operation.kind === 'add-capability' || operation.kind === 'remove-capability') && knownCapabilities.includes(operation.capability as (typeof knownCapabilities)[number]));
  if (changes.length === 0) return;
  const dedicated = repositoryPath(root, 'winzard.json');
  const file = await exists(dedicated) ? dedicated : repositoryPath(root, 'package.json');
  const raw: unknown = JSON.parse(await readFile(file, 'utf8'));
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('MANIFEST_INVALID');
  const wrapper = raw as Record<string, unknown>;
  const manifest = file === dedicated ? wrapper : wrapper.winzard;
  if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) throw new Error('MANIFEST_INVALID');
  const record = manifest as Record<string, unknown>;
  const values = new Set(Array.isArray(record.capabilities) ? record.capabilities.filter((item): item is string => typeof item === 'string') : []);
  for (const change of changes) {
    if (change.kind === 'add-capability') values.add(change.capability);
    else values.delete(change.capability);
  }
  record.capabilities = [...values].sort();
  if (file !== dedicated) wrapper.winzard = record;
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(wrapper, null, 2)}\n`, 'utf8'); await rename(temporary, file);
}

async function materialize(plan: RecipePlan): Promise<readonly InstalledFileState[]> {
  const state = await loadExtensionState(plan.projectRoot);
  const previous = state.extensions.find((item) => item.name === (plan.extension?.name ?? plan.recipe.name));
  const output: InstalledFileState[] = (previous?.files ?? []).filter((item) => plan.unchanged.includes(item.path));
  for (const operation of plan.operations) {
    if (operation.kind !== 'create-file' && operation.kind !== 'update-file') continue;
    const target = repositoryPath(plan.projectRoot, operation.path);
    await assertNoSymlinkEscape(plan.projectRoot, target); await mkdir(path.dirname(target), { recursive: true });
    const content = await readFile(repositoryPath(path.join(plan.sourceRoot, 'files'), operation.source));
    const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(temporary, content); await rename(temporary, target);
    output.push(Object.freeze({ path: operation.path, ownership: operation.ownership, sourceHash: operation.sourceHash, outputHash: operation.sourceHash }));
  }
  return Object.freeze(output.sort((a, b) => a.path.localeCompare(b.path)));
}

export async function applyRecipe(plan: RecipePlan): Promise<InstalledExtensionState> {
  if (plan.issues.some(({ severity }) => severity === 'error')) throw Object.assign(new Error('EXTENSION_RECIPE_CONFLICT'), { code: 'EXTENSION_RECIPE_CONFLICT' });
  await updatePackage(plan.projectRoot, plan.operations); await updateCapabilities(plan.projectRoot, plan.operations);
  const files = await materialize(plan);
  const state = await loadExtensionState(plan.projectRoot);
  const name = plan.extension?.name ?? plan.recipe.name;
  const previous = state.extensions.find((item) => item.name === name);
  const now = new Date().toISOString();
  const installed: InstalledExtensionState = Object.freeze({
    name, version: plan.extension?.version ?? plan.recipe.version, source: plan.extension?.sourceRoot ?? plan.sourceRoot,
    recipe: plan.recipe.name, recipeVersion: plan.recipe.version,
    capabilities: Object.freeze([...new Set([...(plan.extension?.provides ?? []), ...plan.recipe.provides])].sort()),
    requires: Object.freeze([...new Set([...(plan.extension?.requires ?? []), ...plan.recipe.requires])].sort()),
    conflicts: Object.freeze([...new Set([...(plan.extension?.conflicts ?? []), ...plan.recipe.conflicts])].sort()),
    runtimeDependencies: Object.freeze([...new Set([...plan.recipe.dependencies.runtime.map(({ name: item }) => item), ...(plan.extension?.packages.runtime.map(({ name: item }) => item) ?? [])])].sort()),
    developmentDependencies: Object.freeze([...new Set([...plan.recipe.dependencies.development.map(({ name: item }) => item), ...(plan.extension?.packages.development.map(({ name: item }) => item) ?? [])])].sort()),
    files, appliedMigrations: Object.freeze([...new Set([...(previous?.appliedMigrations ?? []), ...plan.migrations])].sort()),
    installedAt: previous?.installedAt ?? now, updatedAt: now,
  });
  await writeExtensionState(plan.projectRoot, [...state.extensions.filter((item) => item.name !== name), installed]);
  return installed;
}

export async function planRemoval(projectRoot: string, name: string): Promise<Readonly<{ operations: readonly RecipePlanOperation[]; issues: readonly ExtensionIssue[] }>> {
  const state = await loadExtensionState(projectRoot);
  const target = state.extensions.find((item) => item.name === name);
  const issues: ExtensionIssue[] = []; const operations: RecipePlanOperation[] = [];
  if (!target) return { operations, issues: [{ severity: 'error', area: 'state', code: 'EXTENSION_NOT_INSTALLED', file: STATE_FILE, message: `Nincs telepítve: ${name}.` }] };
  const project = await loadProjectManifest(projectRoot);
  const others = state.extensions.filter((item) => item.name !== name);
  const alternatives = new Set([...(project.manifest?.capabilities ?? []), ...others.flatMap((item) => item.capabilities)]);
  for (const extension of others) for (const required of extension.requires) if (target.capabilities.includes(required) && !alternatives.has(required)) issues.push({ severity: 'error', area: 'capability', code: 'EXTENSION_REMOVE_DEPENDENT_PRESENT', file: STATE_FILE, message: `${extension.name} megköveteli: ${required}.` });
  for (const file of target.files) {
    if (file.ownership === 'consumer-owned-after-create') continue;
    const current = await fileHash(repositoryPath(projectRoot, file.path));
    if (current === null) continue;
    if (current !== file.outputHash) issues.push({ severity: 'error', area: 'recipe', code: 'EXTENSION_RECIPE_DRIFT', file: file.path, message: 'A módosított owned fájl nem törölhető.' });
    else operations.push(Object.freeze({ kind: 'delete-file', path: file.path, previousHash: current }));
  }
  const runtime = new Set(others.flatMap((item) => item.runtimeDependencies));
  const development = new Set(others.flatMap((item) => item.developmentDependencies));
  for (const dependency of target.runtimeDependencies) if (!runtime.has(dependency)) operations.push(Object.freeze({ kind: 'remove-runtime-dependency', name: dependency }));
  for (const dependency of target.developmentDependencies) if (!development.has(dependency)) operations.push(Object.freeze({ kind: 'remove-development-dependency', name: dependency }));
  for (const capability of target.capabilities) if (!alternatives.has(capability)) operations.push(Object.freeze({ kind: 'remove-capability', capability }));
  return Object.freeze({ operations: Object.freeze(operations), issues: Object.freeze(issues) });
}

export async function removeExtension(projectRoot: string, name: string): Promise<void> {
  const removal = await planRemoval(projectRoot, name);
  if (removal.issues.some(({ severity }) => severity === 'error')) throw Object.assign(new Error('EXTENSION_REMOVE_BLOCKED'), { code: 'EXTENSION_REMOVE_BLOCKED' });
  for (const operation of removal.operations) if (operation.kind === 'delete-file') { const target = repositoryPath(projectRoot, operation.path); await assertNoSymlinkEscape(projectRoot, target); await rm(target, { force: true }); }
  await updatePackage(projectRoot, removal.operations); await updateCapabilities(projectRoot, removal.operations);
  const state = await loadExtensionState(projectRoot); await writeExtensionState(projectRoot, state.extensions.filter((item) => item.name !== name));
}
