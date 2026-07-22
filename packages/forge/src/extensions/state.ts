import { access, lstat, mkdir, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { ExtensionStateFile, InstalledExtensionState, InstalledFileState, RecipeOwnership } from './types';

export const EXTENSION_STATE_FILE = '.winzard/state/extensions.json';
const OWNERSHIPS = new Set<RecipeOwnership>(['generated-read-only', 'generated-with-regions', 'consumer-owned-after-create']);
const HASH = /^[a-f0-9]{64}$/u;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function strings(value: unknown): readonly string[] {
  return Object.freeze(Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').sort() : []);
}

export async function exists(target: string): Promise<boolean> {
  try { await access(target); return true; } catch { return false; }
}

export function repositoryPath(root: string, relative: string): string {
  if (relative.includes('\0') || path.isAbsolute(relative)) throw Object.assign(new Error(`EXTENSION_PATH_ESCAPE: ${relative}`), { code: 'EXTENSION_PATH_ESCAPE' });
  const absolute = path.resolve(root, relative);
  const relation = path.relative(path.resolve(root), absolute);
  if (relation === '..' || relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation)) throw Object.assign(new Error(`EXTENSION_PATH_ESCAPE: ${relative}`), { code: 'EXTENSION_PATH_ESCAPE' });
  return absolute;
}

async function nearestExistingAncestor(target: string): Promise<string> {
  let current = target;
  while (!(await exists(current))) {
    const parent = path.dirname(current);
    if (parent === current) return current;
    current = parent;
  }
  return current;
}

export async function assertNoSymlinkEscape(root: string, target: string): Promise<void> {
  const canonicalRoot = await realpath(root);
  const ancestor = await nearestExistingAncestor(target);
  const canonicalAncestor = await realpath(ancestor);
  const relation = path.relative(canonicalRoot, canonicalAncestor);
  if (relation === '..' || relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation)) throw Object.assign(new Error(`EXTENSION_PATH_ESCAPE: ${target}`), { code: 'EXTENSION_PATH_ESCAPE' });
  let current = ancestor;
  while (current !== canonicalRoot && current !== path.dirname(current)) {
    const info = await lstat(current);
    if (info.isSymbolicLink()) {
      const linkRelation = path.relative(canonicalRoot, await realpath(current));
      if (linkRelation === '..' || linkRelation.startsWith(`..${path.sep}`) || path.isAbsolute(linkRelation)) throw Object.assign(new Error(`EXTENSION_PATH_ESCAPE: ${target}`), { code: 'EXTENSION_PATH_ESCAPE' });
    }
    current = path.dirname(current);
  }
}

function installedFile(value: unknown): InstalledFileState | null {
  const raw = record(value);
  const filePath = raw ? text(raw.path) : null;
  const ownership = raw ? text(raw.ownership) : null;
  const sourceHash = raw ? text(raw.sourceHash) : null;
  const outputHash = raw ? text(raw.outputHash) : null;
  if (!raw || !filePath || !ownership || !OWNERSHIPS.has(ownership as RecipeOwnership) || !sourceHash || !HASH.test(sourceHash) || !outputHash || !HASH.test(outputHash)) return null;
  return Object.freeze({ path: filePath, ownership: ownership as RecipeOwnership, sourceHash, outputHash });
}

function installedExtension(value: unknown): InstalledExtensionState | null {
  const raw = record(value);
  if (!raw || !Array.isArray(raw.files)) return null;
  const name = text(raw.name);
  const version = text(raw.version);
  const source = text(raw.source);
  const installedAt = text(raw.installedAt);
  const updatedAt = text(raw.updatedAt);
  const files = raw.files.map(installedFile);
  if (!name || !version || !source || !installedAt || !updatedAt || files.some((item) => item === null)) return null;
  return Object.freeze({
    name,
    version,
    source,
    recipe: raw.recipe === null ? null : text(raw.recipe),
    recipeVersion: raw.recipeVersion === null ? null : text(raw.recipeVersion),
    capabilities: strings(raw.capabilities),
    requires: strings(raw.requires),
    conflicts: strings(raw.conflicts),
    runtimeDependencies: strings(raw.runtimeDependencies),
    developmentDependencies: strings(raw.developmentDependencies),
    files: Object.freeze((files as InstalledFileState[]).sort((left, right) => left.path.localeCompare(right.path))),
    appliedMigrations: strings(raw.appliedMigrations),
    installedAt,
    updatedAt,
  });
}

export async function loadExtensionState(root: string): Promise<ExtensionStateFile> {
  const file = repositoryPath(root, EXTENSION_STATE_FILE);
  let source: string;
  try { source = await readFile(file, 'utf8'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return Object.freeze({ schemaVersion: 1, extensions: Object.freeze([]) });
    throw error;
  }
  const raw = record(JSON.parse(source));
  if (!raw || raw.schemaVersion !== 1 || !Array.isArray(raw.extensions)) throw Object.assign(new Error('EXTENSION_STATE_INVALID'), { code: 'EXTENSION_STATE_INVALID' });
  const extensions = raw.extensions.map(installedExtension);
  if (extensions.some((item) => item === null)) throw Object.assign(new Error('EXTENSION_STATE_INVALID'), { code: 'EXTENSION_STATE_INVALID' });
  return Object.freeze({ schemaVersion: 1, extensions: Object.freeze((extensions as InstalledExtensionState[]).sort((left, right) => left.name.localeCompare(right.name))) });
}

export async function writeExtensionState(root: string, extensions: readonly InstalledExtensionState[]): Promise<void> {
  const file = repositoryPath(root, EXTENSION_STATE_FILE);
  await assertNoSymlinkEscape(root, file);
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  const payload: ExtensionStateFile = Object.freeze({ schemaVersion: 1, extensions: Object.freeze([...extensions].sort((left, right) => left.name.localeCompare(right.name))) });
  await writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await rename(temporary, file);
}
