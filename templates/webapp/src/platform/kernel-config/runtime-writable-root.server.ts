import 'server-only';

import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { KernelConfigurationError } from './kernel-config.errors';

export async function directoryIsWritable(directoryInput: string): Promise<boolean> {
  const directory = path.resolve(/* turbopackIgnore: true */ directoryInput);
  const probe = path.join(
    /* turbopackIgnore: true */ directory,
    `.winzard-write-probe-${process.pid}-${randomUUID()}`,
  );
  try {
    await writeFile(/* turbopackIgnore: true */ probe, '', {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EACCES' || code === 'EROFS' || code === 'EPERM') return false;
    throw error;
  } finally {
    await rm(/* turbopackIgnore: true */ probe, { force: true }).catch(() => undefined);
  }
}

export async function verifyRuntimeWritableRoot(input: string): Promise<void> {
  const writableRoot = path.resolve(/* turbopackIgnore: true */ input);
  await mkdir(/* turbopackIgnore: true */ writableRoot, { recursive: true });
  if (!(await directoryIsWritable(writableRoot))) {
    throw new KernelConfigurationError(
      'KERNEL_READ_ONLY_FILESYSTEM_VIOLATION',
      'A runtime írható könyvtár nem írható.',
    );
  }
}
