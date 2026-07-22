import { access, lstat, mkdir, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { ExtensionStateFile, InstalledExtensionState } from './types';

export const EXTENSION_STATE_FILE = '.winzard/state/extensions.json';

export async function exists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

export function repositoryPath(root: string, relative: string): string {
  if (relative.includes('\0') || path.isAbsolute(relative)) {
    throw Object.assign(new Error(`EXTENSION_PATH_ESCAPE: ${relative}`), { code: 'EXTENSION_PATH_ESCAPE' });
  }
  const absolute = path.resolve(root, relative);
  const normalizedRoot = path.resolve(root);
  const relation = path.relative(normalizedRoot, absolute);
  if (relation === '..' || relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation)) {
    throw Object.assign(new Error(`EXTENSION_PATH_ESCAPE: ${relative}`), { code: 'EXTENSION_PATH_ESCAPE' });
  }
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
  if (relation === '..' || relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation)) {
    throw Object.assign(new Error(`EXTENSION_PATH_ESCAPE: ${target}`), { code: 'EXTENSION_PATH_ESCAPE' });
  }
  let current = ancestor;
  while (current !== canonicalRoot && current !== path.dirname(current)) {
    const info = await lstat(current);
    if (info.isSymbolicLink()) {
      const canonical = await realpath(current);
      const linkRelation = path.relative(canonicalRoot, canonical);
      if (linkRelation === '..' || linkRelation.startsWith(`..${path.sep}`) || path.isAbsolute(linkRelation)) {
        throw Object.assign(new Error(`EXTENSION_PATH_ESCAPE: ${target}`), { code: 'EXTENSION_PATH_ESCAPE' });
      }
    }
    current = path.dirname(current);
  }
}

function isInstalledExtensionState(value: unknown): value is InstalledExtensionState {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    typeof (value as { name?: unknown }).name === 'string' &&
    typeof (value as { version?: unknown }).version === 'string' &&
    Array.isArray((value as { files?: unknown }).files);
}

export async function loadExtensionState(root: string): Promise<ExtensionStateFile> {
  const file = repositoryPath(root, EXTENSION_STATE_FILE);
  let source: string;
  try {
    source = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return Object.freeze({ schemaVersion: 1, extensions: Object.freeze([]) });
    }
    throw error;
  }
  const raw: unknown = JSON.parse(source);
  if (
    typeof raw !== 'object' || raw === null || Array.isArray(raw) ||
    (raw as { schemaVersion?: unknown }).schemaVersion !== 1 ||
    !Array.isArray((raw as { extensions?: unknown }).extensions) ||
    !(raw as { extensions: unknown[] }).extensions.every(isInstalledExtensionState)
  ) {
    throw Object.assign(new Error('EXTENSION_STATE_INVALID'), { code: 'EXTENSION_STATE_INVALID' });
  }
  return Object.freeze({
    schemaVersion: 1,
    extensions: Object.freeze([...(raw as { extensions: InstalledExtensionState[] }).extensions]
      .sort((left, right) => left.name.localeCompare(right.name))),
  });
}

export async function writeExtensionState(root: string, extensions: readonly InstalledExtensionState[]): Promise<void> {
  const file = repositoryPath(root, EXTENSION_STATE_FILE);
  await assertNoSymlinkEscape(root, file);
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  const payload: ExtensionStateFile = Object.freeze({
    schemaVersion: 1,
    extensions: Object.freeze([...extensions].sort((left, right) => left.name.localeCompare(right.name))),
  });
  await writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await rename(temporary, file);
}
