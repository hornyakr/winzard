import 'server-only';

import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { KernelConfigurationError } from './kernel-config.errors';
import { pathIsContained } from './project-paths';

export type RuntimeFilesystemPolicy = Readonly<{
  applicationRoot: string;
  writableRoot: string;
  requireReadOnlyApplication: boolean;
}>;

async function canCreateFile(directory: string): Promise<boolean> {
  const probe = path.join(
    /* turbopackIgnore: true */ directory,
    `.winzard-write-probe-${process.pid}-${randomUUID()}`,
  );
  try {
    await writeFile(probe, '', { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EACCES' || code === 'EROFS' || code === 'EPERM') return false;
    throw error;
  } finally {
    await rm(probe, { force: true }).catch(() => undefined);
  }
}

export async function verifyRuntimeFilesystem(
  policy: RuntimeFilesystemPolicy,
): Promise<void> {
  const writableRoot = path.resolve(/* turbopackIgnore: true */ policy.writableRoot);
  if (pathIsContained(policy.applicationRoot, writableRoot)) {
    throw new KernelConfigurationError(
      'KERNEL_READ_ONLY_FILESYSTEM_VIOLATION',
      'A runtime írható könyvtár nem lehet az immutable application artifact alatt.',
    );
  }

  if (policy.requireReadOnlyApplication) {
    if (await canCreateFile(path.resolve(/* turbopackIgnore: true */ policy.applicationRoot))) {
      throw new KernelConfigurationError(
        'KERNEL_READ_ONLY_FILESYSTEM_VIOLATION',
        'Productionban az application artifact írható; read-only root filesystem szükséges.',
      );
    }
  }
  await mkdir(writableRoot, { recursive: true });
  if (!(await canCreateFile(writableRoot))) {
    throw new KernelConfigurationError(
      'KERNEL_READ_ONLY_FILESYSTEM_VIOLATION',
      'A runtime írható könyvtár nem írható.',
    );
  }
}
