import { execFile } from 'node:child_process';
import { access, realpath } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import type { KernelConfigurationIssue } from './types';

const execFileAsync = promisify(execFile);

async function exists(value: string): Promise<boolean> {
  try { await access(value); return true; } catch { return false; }
}

async function realPathOrResolve(value: string): Promise<string> {
  try { return await realpath(value); } catch { return path.resolve(value); }
}

function contained(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || (
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

async function gitRepositoryRoot(start: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['rev-parse', '--show-toplevel'],
      { cwd: start, maxBuffer: 1024 * 1024 },
    );
    return await realPathOrResolve(stdout.trim());
  } catch {
    return null;
  }
}

async function workspaceRepositoryRoot(start: string): Promise<string> {
  let candidate = path.resolve(start);
  for (;;) {
    if (
      await exists(path.join(candidate, 'pnpm-workspace.yaml')) ||
      await exists(path.join(candidate, '.git'))
    ) return await realPathOrResolve(candidate);
    const parent = path.dirname(candidate);
    if (parent === candidate) return await realPathOrResolve(start);
    candidate = parent;
  }
}

export type ForgeProjectPaths = Readonly<{
  repositoryRoot: string;
  applicationRoot: string;
  repositoryRelativeRoot: string;
  issues: readonly KernelConfigurationIssue[];
}>;

export async function resolveForgeProjectPaths(
  projectRoot: string,
): Promise<ForgeProjectPaths> {
  const requestedRoot = path.resolve(projectRoot);
  const repositoryRoot = await gitRepositoryRoot(requestedRoot) ??
    await workspaceRepositoryRoot(requestedRoot);
  const applicationRoot = await realPathOrResolve(requestedRoot);
  const issues: KernelConfigurationIssue[] = [];
  if (!contained(repositoryRoot, applicationRoot)) {
    issues.push({
      severity: 'error',
      area: 'path',
      code: 'KERNEL_PROJECT_ROOT_OUTSIDE_REPOSITORY',
      file: 'project root',
      message: 'A projektgyökér a repository valós gyökerén kívülre mutat.',
      remediation: 'Use a repository-contained --project path and remove symlink escapes.',
    });
  }
  return {
    repositoryRoot,
    applicationRoot,
    repositoryRelativeRoot: path.relative(repositoryRoot, applicationRoot).split(path.sep).join('/') || '.',
    issues,
  };
}

export function pathContained(root: string, target: string): boolean {
  return contained(path.resolve(root), path.resolve(target));
}
