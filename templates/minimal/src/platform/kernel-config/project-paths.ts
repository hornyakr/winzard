import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';

import { KernelConfigurationError } from './kernel-config.errors';

export type ProjectPaths = Readonly<{
  repositoryRoot: string;
  applicationRoot: string;
  packageRoot: string;
  runtimeWorkingDirectory: string;
  buildDirectory: string;
  buildDirectoryRelative: string;
}>;

function rejectUnsafePath(value: string, label: string): void {
  if (value.includes('\u0000')) {
    throw new KernelConfigurationError(
      'KERNEL_PROJECT_ROOT_OUTSIDE_REPOSITORY',
      `${label} null byte-ot tartalmaz.`,
    );
  }
  if (value.length > 4096) {
    throw new KernelConfigurationError(
      'KERNEL_PROJECT_ROOT_OUTSIDE_REPOSITORY',
      `${label} túl hosszú.`,
    );
  }
}

function realPathIfPresent(value: string): string {
  return existsSync(/* turbopackIgnore: true */ value)
    ? realpathSync.native(/* turbopackIgnore: true */ value)
    : path.resolve(/* turbopackIgnore: true */ value);
}

export function pathIsContained(root: string, target: string): boolean {
  const normalizedRoot = realPathIfPresent(root);
  const normalizedTarget = realPathIfPresent(target);
  const relative = path.relative(normalizedRoot, normalizedTarget);
  return relative === '' || (
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

export function assertContainedPath(
  root: string,
  target: string,
  code:
    | 'KERNEL_PROJECT_ROOT_OUTSIDE_REPOSITORY'
    | 'KERNEL_BUILD_DIR_OUTSIDE_PROJECT',
  label: string,
): void {
  if (!pathIsContained(root, target)) {
    throw new KernelConfigurationError(
      code,
      `${label} a megengedett gyökéren kívülre mutat.`,
    );
  }
}

export function findRepositoryRoot(start: string): string {
  let candidate = realPathIfPresent(start);
  for (;;) {
    if (
      existsSync(path.join(/* turbopackIgnore: true */ candidate, '.git')) ||
      existsSync(path.join(/* turbopackIgnore: true */ candidate, 'pnpm-workspace.yaml'))
    ) {
      return candidate;
    }
    const parent = path.dirname(candidate);
    if (parent === candidate) return realPathIfPresent(start);
    candidate = parent;
  }
}

export function resolveProjectPaths(input: Readonly<{
  applicationRoot: string;
  repositoryRoot?: string;
  packageRoot?: string;
  runtimeWorkingDirectory?: string;
  buildDirectory?: string;
}>): ProjectPaths {
  rejectUnsafePath(input.applicationRoot, 'applicationRoot');
  const applicationRoot = realPathIfPresent(input.applicationRoot);
  const repositoryRoot = realPathIfPresent(
    input.repositoryRoot ?? findRepositoryRoot(applicationRoot),
  );
  const packageRoot = realPathIfPresent(input.packageRoot ?? applicationRoot);
  const runtimeWorkingDirectory = realPathIfPresent(
    input.runtimeWorkingDirectory ?? process.cwd(),
  );
  const rawBuildDirectory = input.buildDirectory?.trim() || '.next';
  rejectUnsafePath(rawBuildDirectory, 'buildDirectory');
  const buildDirectory = path.isAbsolute(rawBuildDirectory)
    ? path.resolve(rawBuildDirectory)
    : path.resolve(applicationRoot, rawBuildDirectory);

  assertContainedPath(
    repositoryRoot,
    applicationRoot,
    'KERNEL_PROJECT_ROOT_OUTSIDE_REPOSITORY',
    'Az alkalmazásgyökér',
  );
  assertContainedPath(
    repositoryRoot,
    packageRoot,
    'KERNEL_PROJECT_ROOT_OUTSIDE_REPOSITORY',
    'A package-gyökér',
  );
  assertContainedPath(
    applicationRoot,
    buildDirectory,
    'KERNEL_BUILD_DIR_OUTSIDE_PROJECT',
    'A buildkönyvtár',
  );

  const buildDirectoryRelative = path.relative(applicationRoot, buildDirectory);
  return Object.freeze({
    repositoryRoot,
    applicationRoot,
    packageRoot,
    runtimeWorkingDirectory,
    buildDirectory,
    buildDirectoryRelative: buildDirectoryRelative || '.next',
  });
}
