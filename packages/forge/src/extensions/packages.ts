import { execFile } from 'node:child_process';
import { access, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import type { ExtensionIssue, PackageInspection } from './types';

const execFileAsync = promisify(execFile);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function exists(file: string): Promise<boolean> {
  try { await access(file); return true; } catch { return false; }
}

function exportKeys(raw: unknown): readonly string[] {
  if (typeof raw === 'string') return ['.'];
  if (!isRecord(raw)) return [];
  const keys = Object.keys(raw);
  return Object.freeze((keys.some((key) => key.startsWith('.')) ? keys : ['.']).sort());
}

function collectExportTargets(raw: unknown): readonly string[] {
  const output = new Set<string>();
  const visit = (value: unknown): void => {
    if (typeof value === 'string') output.add(value);
    else if (isRecord(value)) for (const item of Object.values(value)) visit(item);
  };
  visit(raw);
  return Object.freeze([...output].sort());
}

export async function inspectPackage(packageRoot: string): Promise<PackageInspection> {
  const root = path.resolve(packageRoot);
  const file = path.join(root, 'package.json');
  const issues: ExtensionIssue[] = [];
  let raw: Record<string, unknown> | null = null;
  try {
    const value: unknown = JSON.parse(await readFile(file, 'utf8'));
    if (!isRecord(value)) throw new Error('A package.json gyökere objektum legyen.');
    raw = value;
  } catch (error) {
    issues.push({ severity: 'error', area: 'package', code: 'EXTENSION_PACKAGE_INVALID', file, message: error instanceof Error ? error.message : String(error) });
  }
  if (!raw) return Object.freeze({ root, name: null, version: null, exports: [], files: [], issues: Object.freeze(issues) });
  const name = typeof raw.name === 'string' ? raw.name : null;
  const version = typeof raw.version === 'string' ? raw.version : null;
  if (!name || !version) issues.push({ severity: 'error', area: 'package', code: 'EXTENSION_PACKAGE_INVALID', file, message: 'A package name és version mezője kötelező.' });
  if (raw.type !== 'module') issues.push({ severity: 'error', area: 'package', code: 'EXTENSION_PACKAGE_ESM_REQUIRED', file, message: 'A Winzard extension package type mezője module legyen.' });
  const exports = exportKeys(raw.exports);
  if (exports.length === 0) issues.push({ severity: 'error', area: 'package', code: 'EXTENSION_PACKAGE_EXPORT_MISSING', file, message: 'Hiányzik az explicit package exports contract.' });
  const targets = collectExportTargets(raw.exports);
  for (const target of targets) {
    const relative = target.startsWith('./') ? target.slice(2) : target;
    if (!relative || path.isAbsolute(relative) || relative.startsWith('../')) {
      issues.push({ severity: 'error', area: 'package', code: 'EXTENSION_PACKAGE_EXPORT_MISSING', file, message: `Érvénytelen export target: ${target}.` });
      continue;
    }
    if (!(await exists(path.join(root, relative)))) {
      issues.push({ severity: 'error', area: 'package', code: 'EXTENSION_PACKAGE_EXPORT_MISSING', file, message: `Az export target hiányzik: ${target}.` });
    }
  }
  const files = Array.isArray(raw.files) ? raw.files.filter((item): item is string => typeof item === 'string').sort() : [];
  if (files.length === 0) issues.push({ severity: 'error', area: 'package', code: 'EXTENSION_TARBALL_CONTENT_INVALID', file, message: 'A package files allowlist kötelező.' });
  if (files.some((item) => item.includes('.env') || item.includes('coverage') || item.includes('node_modules'))) {
    issues.push({ severity: 'error', area: 'package', code: 'EXTENSION_TARBALL_CONTENT_INVALID', file, message: 'A files allowlist tiltott vagy érzékeny útvonalat tartalmaz.' });
  }
  const peer = isRecord(raw.peerDependencies) ? raw.peerDependencies : {};
  const dependencies = isRecord(raw.dependencies) ? raw.dependencies : {};
  if ((name?.includes('ui') || exports.includes('./client')) && dependencies.react !== undefined) {
    issues.push({ severity: 'error', area: 'package', code: 'EXTENSION_PACKAGE_DUPLICATE_REACT', file, message: 'React UI package-ben a react peerDependency legyen, ne runtime dependency.' });
  }
  if ((name?.includes('ui') || exports.includes('./client')) && peer.react === undefined) {
    issues.push({ severity: 'warning', area: 'package', code: 'EXTENSION_PACKAGE_REACT_PEER_MISSING', file, message: 'A React UI package nem deklarál react peerDependency-t.' });
  }
  if (raw.sideEffects === undefined) {
    issues.push({ severity: 'warning', area: 'package', code: 'EXTENSION_PACKAGE_SIDE_EFFECTS_UNDECLARED', file, message: 'A sideEffects contract nincs deklarálva.' });
  }
  return Object.freeze({
    root,
    name,
    version,
    exports,
    files: Object.freeze(files),
    issues: Object.freeze(issues.sort((left, right) => left.code.localeCompare(right.code))),
  });
}

export async function packSmoke(packageRoot: string): Promise<Readonly<{ archive: string | null; issues: readonly ExtensionIssue[] }>> {
  const inspection = await inspectPackage(packageRoot);
  const issues: ExtensionIssue[] = [...inspection.issues];
  if (issues.some(({ severity }) => severity === 'error')) return { archive: null, issues };
  const destination = await mkdtemp(path.join(os.tmpdir(), 'winzard-pack-'));
  try {
    const { stdout } = await execFileAsync('pnpm', ['pack', '--pack-destination', destination], { cwd: packageRoot });
    const archives = (await readdir(destination)).filter((name: string) => name.endsWith('.tgz')).sort();
    if (archives.length !== 1) {
      issues.push({ severity: 'error', area: 'package', code: 'EXTENSION_TARBALL_CONTENT_INVALID', file: packageRoot, message: `A pack pontosan egy tarballt adjon, kapott: ${archives.length}. ${stdout.trim()}` });
      return { archive: null, issues };
    }
    return { archive: path.join(destination, archives[0] ?? ''), issues };
  } catch (error) {
    issues.push({ severity: 'error', area: 'package', code: 'EXTENSION_TARBALL_CONTENT_INVALID', file: packageRoot, message: error instanceof Error ? error.message : String(error) });
    await rm(destination, { recursive: true, force: true });
    return { archive: null, issues };
  }
}
