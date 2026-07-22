import 'server-only';

import path from 'node:path';

import { KernelConfigurationError } from './kernel-config.errors';
import { pathIsContained } from './project-paths';
import {
  directoryIsWritable,
  verifyRuntimeWritableRoot,
} from './runtime-writable-root.server';

export type RuntimeFilesystemPolicy = Readonly<{
  applicationRoot: string;
  writableRoot: string;
  requireReadOnlyApplication: boolean;
}>;

export async function verifyRuntimeFilesystem(
  policy: RuntimeFilesystemPolicy,
): Promise<void> {
  const applicationRoot = path.resolve(/* turbopackIgnore: true */ policy.applicationRoot);
  const writableRoot = path.resolve(/* turbopackIgnore: true */ policy.writableRoot);
  if (pathIsContained(applicationRoot, writableRoot)) {
    throw new KernelConfigurationError(
      'KERNEL_READ_ONLY_FILESYSTEM_VIOLATION',
      'A runtime írható könyvtár nem lehet az immutable application artifact alatt.',
    );
  }

  if (policy.requireReadOnlyApplication && await directoryIsWritable(applicationRoot)) {
    throw new KernelConfigurationError(
      'KERNEL_READ_ONLY_FILESYSTEM_VIOLATION',
      'Productionban az application artifact írható; read-only root filesystem szükséges.',
    );
  }

  await verifyRuntimeWritableRoot(writableRoot);
}
