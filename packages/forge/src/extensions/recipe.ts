import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { knownCapabilities, loadProjectManifest } from '../manifest';
import { loadRecipeManifest } from './schema';
import {
  assertNoSymlinkEscape,
  exists,
  loadExtensionState,
  repositoryPath,
  writeExtensionState,
} from './state';
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

function hash(content: string | Uint8Array): string {
  return createHash('sha256').update(content).digest('hex');
}

async function fileHash(file: string): Promise<string | null> {
  try {
    return hash(await readFile(file));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function expandDeclaration(recipeRoot: string, declaration: RecipeFileDeclaration): Promise<readonly RecipeFileDeclaration[]> {
  const source = repositoryPath(path.join(recipeRoot, 'files'), declaration.source);
  const info = await stat(source);
  if (info.isFile()) return [declaration];
  if (!info.isDirectory()) return [];
  const output: RecipeFileDeclaration[] = [];
  const visit = async (directory: string, relative: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const entryRelative = relative === '' ? entry.name : `${relative}/${entry.name}`;
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(entryPath, entryRelative);
      else if (entry.isFile()) {
        output.push(Object.freeze({
          path: `${declaration.path.replace(/\/$/u, '')}/${entryRelative}`,
          source: `${declaration.source.replace(/\/$/u, '')}/${entryRelative}`,
          ownership: declaration.ownership,
        }));
      }
    }
  };
  await visit(source, '');
  return Object.freeze(output.sort((left, right) => left.path.localeCompare(right.path)));
}

function dependencyOperations(
  declarations: readonly DependencyDeclaration[],
  installed: Readonly<Record<string, string>>,
  kind: 'runtime' | 'development',
  issues: ExtensionIssue[],
  file: string,
): RecipePlanOperation[] {
  const output: RecipePlanOperation[] = [];
  for (const declaration of declarations) {
    if (installed[declaration.name] !== undefined) continue;
    if (!declaration.version) {
      issues.push({
        severity: 'error',
        area: 'recipe',
        code: 'EXTENSION_DEPENDENCY_VERSION_MISSING',
        file,
        message: `A ${declaration.name} dependency verziója nincs deklarálva és nincs telepítve.`,
      });
      continue;
    }
    output.push(Object.freeze({
      kind: kind === 'runtime' ? 'add-runtime-dependency' : 'add-development-dependency',
      name: declaration.name,
      version: declaration.version,
    }));
  }
  return output;
}

async function readProjectPackage(root: string): Promise<Record<string, unknown>> {
  const file = repositoryPath(root, 'package.json');
  const raw: unknown = JSON.parse(await readFile(file, 'utf8'));
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('PROJECT_PACKAGE_INVALID');
  return raw as Record<string, unknown>;
}

function dependencyMap(raw: unknown): Record<string, string> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}

function installedRecord(state: readonly InstalledExtensionState[], extension: ExtensionManifest | null, recipe: RecipeManifest): InstalledExtensionState | null {
  const name = extension?.name ?? recipe.name;
  return state.find((item) => item.name === name) ?? null;
}

export async function planRecipe(
  projectRoot: string,
  recipeRoot: string,
  extension: ExtensionManifest | null = null,
): Promise<RecipePlan> {
  const loaded = await loadRecipeManifest(recipeRoot);
  if (!loaded.manifest) {
    return Object.freeze({
      extension,
      recipe: Object.freeze({
        schemaVersion: 1,
        name: '<invalid>',
        version: '0.0.0',
        provides: [],
        requires: [],
        conflicts: [],
        dependencies: { runtime: [], development: [] },
        environment: [],
        configuration: [],
        files: [],
        generated: [],
        migrations: [],
      }),
      projectRoot,
      sourceRoot: recipeRoot,
      operations: [],
      issues: loaded.issues,
      unchanged: [],
    });
  }
  const recipe = loaded.manifest;
  const issues: ExtensionIssue[] = [...loaded.issues];
  const operations: RecipePlanOperation[] = [];
  const unchanged: string[] = [];
  const manifestResult = await loadProjectManifest(projectRoot);
  if (!manifestResult.manifest) {
    issues.push(...manifestResult.failures.map(({ code, file, message }) => ({ severity: 'error' as const, area: 'manifest' as const, code, file, message })));
  }
  const state = await loadExtensionState(projectRoot);
  const activeCapabilities = new Set([
    ...(manifestResult.manifest?.capabilities ?? []),
    ...state.extensions.flatMap((item) => item.capabilities),
  ]);
  for (const required of recipe.requires) {
    if (!activeCapabilities.has(required) && !recipe.provides.includes(required)) {
      issues.push({ severity: 'error', area: 'capability', code: 'EXTENSION_CAPABILITY_UNKNOWN', file: 'winzard manifest', message: `${recipe.name} megköveteli ezt a capability-t: ${required}.` });
    }
  }
  for (const conflict of recipe.conflicts) {
    if (activeCapabilities.has(conflict)) {
      issues.push({ severity: 'error', area: 'capability', code: 'EXTENSION_CAPABILITY_CONFLICT', file: 'winzard manifest', message: `${recipe.name} ütközik ezzel a telepített capability-vel: ${conflict}.` });
    }
  }
  for (const capability of recipe.provides) {
    if (!activeCapabilities.has(capability)) operations.push(Object.freeze({ kind: 'add-capability', capability }));
  }

  const packageJson = await readProjectPackage(projectRoot);
  operations.push(...dependencyOperations(
    [...recipe.dependencies.runtime, ...(extension?.packages.runtime ?? [])],
    dependencyMap(packageJson.dependencies),
    'runtime',
    issues,
    path.join(recipeRoot, 'recipe.json'),
  ));
  operations.push(...dependencyOperations(
    [...recipe.dependencies.development, ...(extension?.packages.development ?? [])],
    dependencyMap(packageJson.devDependencies),
    'development',
    issues,
    path.join(recipeRoot, 'recipe.json'),
  ));

  const previous = installedRecord(state.extensions, extension, recipe);
  const previousFiles = new Map(previous?.files.map((item) => [item.path, item]) ?? []);
  for (const declaration of recipe.files) {
    let expanded: readonly RecipeFileDeclaration[];
    try {
      expanded = await expandDeclaration(recipeRoot, declaration);
    } catch (error) {
      issues.push({ severity: 'error', area: 'recipe', code: 'EXTENSION_RECIPE_FILE_MISSING', file: declaration.source, message: error instanceof Error ? error.message : String(error) });
      continue;
    }
    for (const entry of expanded) {
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
      if (!sourceHash) {
        issues.push({ severity: 'error', area: 'recipe', code: 'EXTENSION_RECIPE_FILE_MISSING', file: entry.source, message: 'A recipe forrásfájl hiányzik.' });
        continue;
      }
      const currentHash = await fileHash(target);
      const previousFile = previousFiles.get(entry.path);
      if (currentHash === sourceHash) {
        unchanged.push(entry.path);
        continue;
      }
      if (currentHash === null) {
        operations.push(Object.freeze({ kind: 'create-file', path: entry.path, source: entry.source, ownership: entry.ownership, sourceHash, previousHash: null }));
        continue;
      }
      if (!previousFile) {
        issues.push({ severity: 'error', area: 'recipe', code: 'EXTENSION_RECIPE_CONFLICT', file: entry.path, message: 'A célfájl már létezik, de nincs recipe ownership state.' });
        continue;
      }
      if (previousFile.outputHash !== currentHash) {
        issues.push({ severity: 'error', area: 'recipe', code: 'EXTENSION_RECIPE_DRIFT', file: entry.path, message: 'A recipe-owned fájl kézzel módosult.' });
        continue;
      }
      if (entry.ownership === 'consumer-owned-after-create') {
        unchanged.push(entry.path);
        continue;
      }
      if (entry.ownership === 'generated-with-regions') {
        issues.push({ severity: 'error', area: 'recipe', code: 'EXTENSION_RECIPE_REGION_CONFLICT', file: entry.path, message: 'Marker region metadata nélkül a fájl nem frissíthető biztonságosan.' });
        continue;
      }
      operations.push(Object.freeze({ kind: 'update-file', path: entry.path, source: entry.source, ownership: entry.ownership, sourceHash, previousHash: currentHash }));
    }
  }
  return Object.freeze({
    extension,
    recipe,
    projectRoot: path.resolve(projectRoot),
    sourceRoot: path.resolve(recipeRoot),
    operations: Object.freeze(operations),
    issues: Object.freeze(issues.sort((left, right) => left.file.localeCompare(right.file) || left.code.localeCompare(right.code))),
    unchanged: Object.freeze(unchanged.sort()),
  });
}

async function updatePackageJson(root: string, operations: readonly RecipePlanOperation[]): Promise<void> {
  const file = repositoryPath(root, 'package.json');
  const raw = await readProjectPackage(root);
  const runtime = dependencyMap(raw.dependencies);
  const development = dependencyMap(raw.devDependencies);
  for (const operation of operations) {
    if (operation.kind === 'add-runtime-dependency') runtime[operation.name] = operation.version;
    if (operation.kind === 'add-development-dependency') development[operation.name] = operation.version;
    if (operation.kind === 'remove-runtime-dependency') delete runtime[operation.name];
    if (operation.kind === 'remove-development-dependency') delete development[operation.name];
  }
  raw.dependencies = Object.fromEntries(Object.entries(runtime).sort(([left], [right]) => left.localeCompare(right)));
  raw.devDependencies = Object.fromEntries(Object.entries(development).sort(([left], [right]) => left.localeCompare(right)));
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
  await rename(temporary, file);
}

async function updateProjectCapabilities(root: string, operations: readonly RecipePlanOperation[]): Promise<void> {
  const dedicated = repositoryPath(root, 'winzard.json');
  const packageFile = repositoryPath(root, 'package.json');
  const dedicatedExists = await exists(dedicated);
  const file = dedicatedExists ? dedicated : packageFile;
  const wrapper: unknown = JSON.parse(await readFile(file, 'utf8'));
  if (typeof wrapper !== 'object' || wrapper === null || Array.isArray(wrapper)) throw new Error('MANIFEST_INVALID');
  const record = wrapper as Record<string, unknown>;
  const manifest = dedicatedExists ? record : record.winzard;
  if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) throw new Error('MANIFEST_INVALID');
  const manifestRecord = manifest as Record<string, unknown>;
  const capabilities = new Set(Array.isArray(manifestRecord.capabilities) ? manifestRecord.capabilities.filter((item): item is string => typeof item === 'string') : []);
  for (const operation of operations) {
    if (operation.kind === 'add-capability' && knownCapabilities.includes(operation.capability as (typeof knownCapabilities)[number])) capabilities.add(operation.capability);
    if (operation.kind === 'remove-capability' && knownCapabilities.includes(operation.capability as (typeof knownCapabilities)[number])) capabilities.delete(operation.capability);
  }
  manifestRecord.capabilities = [...capabilities].sort();
  if (!dedicatedExists) record.winzard = manifestRecord;
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  await rename(temporary, file);
}

async function materializeFiles(plan: RecipePlan): Promise<readonly InstalledFileState[]> {
  const output: InstalledFileState[] = [];
  const previousState = await loadExtensionState(plan.projectRoot);
  const name = plan.extension?.name ?? plan.recipe.name;
  const previous = previousState.extensions.find((item) => item.name === name);
  const unchanged = new Set(plan.unchanged);
  for (const previousFile of previous?.files ?? []) {
    if (unchanged.has(previousFile.path)) output.push(previousFile);
  }
  for (const operation of plan.operations) {
    if (operation.kind !== 'create-file' && operation.kind !== 'update-file') continue;
    const source = repositoryPath(path.join(plan.sourceRoot, 'files'), operation.source);
    const target = repositoryPath(plan.projectRoot, operation.path);
    await assertNoSymlinkEscape(plan.projectRoot, target);
    await mkdir(path.dirname(target), { recursive: true });
    const content = await readFile(source);
    const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(temporary, content);
    await rename(temporary, target);
    output.push(Object.freeze({
      path: operation.path,
      ownership: operation.ownership,
      sourceHash: operation.sourceHash,
      outputHash: operation.sourceHash,
    }));
  }
  return Object.freeze(output.sort((left, right) => left.path.localeCompare(right.path)));
}

export async function applyRecipe(plan: RecipePlan): Promise<InstalledExtensionState> {
  const errors = plan.issues.filter(({ severity }) => severity === 'error');
  if (errors.length > 0) throw Object.assign(new Error(`EXTENSION_RECIPE_CONFLICT: ${errors.length} hiba`), { code: 'EXTENSION_RECIPE_CONFLICT' });
  await updatePackageJson(plan.projectRoot, plan.operations);
  await updateProjectCapabilities(plan.projectRoot, plan.operations);
  const files = await materializeFiles(plan);
  const state = await loadExtensionState(plan.projectRoot);
  const name = plan.extension?.name ?? plan.recipe.name;
  const previous = state.extensions.find((item) => item.name === name);
  const now = new Date().toISOString();
  const installed: InstalledExtensionState = Object.freeze({
    name,
    version: plan.extension?.version ?? plan.recipe.version,
    source: plan.extension?.sourceRoot ?? plan.sourceRoot,
    recipe: plan.recipe.name,
    recipeVersion: plan.recipe.version,
    capabilities: Object.freeze([...new Set([...(plan.extension?.provides ?? []), ...plan.recipe.provides])].sort()),
    runtimeDependencies: Object.freeze([...new Set([
      ...plan.recipe.dependencies.runtime.map(({ name: dependency }) => dependency),
      ...(plan.extension?.packages.runtime.map(({ name: dependency }) => dependency) ?? []),
    ])].sort()),
    developmentDependencies: Object.freeze([...new Set([
      ...plan.recipe.dependencies.development.map(({ name: dependency }) => dependency),
      ...(plan.extension?.packages.development.map(({ name: dependency }) => dependency) ?? []),
    ])].sort()),
    files,
    appliedMigrations: Object.freeze([...(previous?.appliedMigrations ?? [])]),
    installedAt: previous?.installedAt ?? now,
    updatedAt: now,
  });
  await writeExtensionState(plan.projectRoot, [
    ...state.extensions.filter((item) => item.name !== name),
    installed,
  ]);
  return installed;
}

export async function planRemoval(projectRoot: string, name: string): Promise<Readonly<{ operations: readonly RecipePlanOperation[]; issues: readonly ExtensionIssue[] }>> {
  const state = await loadExtensionState(projectRoot);
  const target = state.extensions.find((item) => item.name === name);
  const issues: ExtensionIssue[] = [];
  const operations: RecipePlanOperation[] = [];
  if (!target) {
    issues.push({ severity: 'error', area: 'state', code: 'EXTENSION_NOT_INSTALLED', file: EXTENSION_STATE_LABEL, message: `Nincs telepítve: ${name}.` });
    return { operations, issues };
  }
  for (const file of target.files) {
    const absolute = repositoryPath(projectRoot, file.path);
    const currentHash = await fileHash(absolute);
    if (file.ownership === 'consumer-owned-after-create') continue;
    if (currentHash === null) continue;
    if (currentHash !== file.outputHash) {
      issues.push({ severity: 'error', area: 'recipe', code: 'EXTENSION_RECIPE_DRIFT', file: file.path, message: 'A módosított owned fájl nem törölhető automatikusan.' });
      continue;
    }
    operations.push(Object.freeze({ kind: 'delete-file', path: file.path, previousHash: currentHash }));
  }
  const otherRuntime = new Set(state.extensions.filter((item) => item.name !== name).flatMap((item) => item.runtimeDependencies));
  const otherDevelopment = new Set(state.extensions.filter((item) => item.name !== name).flatMap((item) => item.developmentDependencies));
  for (const dependency of target.runtimeDependencies) if (!otherRuntime.has(dependency)) operations.push(Object.freeze({ kind: 'remove-runtime-dependency', name: dependency }));
  for (const dependency of target.developmentDependencies) if (!otherDevelopment.has(dependency)) operations.push(Object.freeze({ kind: 'remove-development-dependency', name: dependency }));
  const otherCapabilities = new Set(state.extensions.filter((item) => item.name !== name).flatMap((item) => item.capabilities));
  for (const capability of target.capabilities) if (!otherCapabilities.has(capability)) operations.push(Object.freeze({ kind: 'remove-capability', capability }));
  return Object.freeze({ operations: Object.freeze(operations), issues: Object.freeze(issues) });
}

const EXTENSION_STATE_LABEL = '.winzard/state/extensions.json';

export async function removeExtension(projectRoot: string, name: string): Promise<void> {
  const removal = await planRemoval(projectRoot, name);
  if (removal.issues.some(({ severity }) => severity === 'error')) throw Object.assign(new Error('EXTENSION_REMOVE_BLOCKED'), { code: 'EXTENSION_REMOVE_BLOCKED' });
  for (const operation of removal.operations) {
    if (operation.kind === 'delete-file') {
      const target = repositoryPath(projectRoot, operation.path);
      await assertNoSymlinkEscape(projectRoot, target);
      await rm(target, { force: true });
    }
  }
  await updatePackageJson(projectRoot, removal.operations);
  await updateProjectCapabilities(projectRoot, removal.operations);
  const state = await loadExtensionState(projectRoot);
  await writeExtensionState(projectRoot, state.extensions.filter((item) => item.name !== name));
}
