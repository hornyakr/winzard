import 'server-only';

import { KernelConfigurationError } from './kernel-config.errors';

export type AuthorizedFileReference = Readonly<{
  storageKey: string;
  downloadName: string;
  contentType: string;
}>;

export type FileOffloadMode = 'x-accel-redirect' | 'x-sendfile';

function safeStorageKey(value: string): string {
  const normalized = value.trim();
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,1023}$/u.test(normalized) ||
    normalized.startsWith('/') ||
    normalized.includes('..') ||
    normalized.includes('\\')
  ) {
    throw new KernelConfigurationError(
      'KERNEL_X_SENDFILE_UNSAFE',
      'A storage key relatív, traversalmentes belső kulcs legyen.',
    );
  }
  return normalized;
}

function contentDispositionFilename(value: string): string {
  const sanitized = value.replace(/[\u0000-\u001f\u007f"\\/]/gu, '_').trim().slice(0, 255);
  if (!sanitized) {
    throw new KernelConfigurationError(
      'KERNEL_X_SENDFILE_UNSAFE',
      'A download filename nem lehet üres.',
    );
  }
  return sanitized;
}

export function createInternalFileOffloadResponse(
  file: AuthorizedFileReference,
  input: Readonly<{
    mode: FileOffloadMode;
    internalPrefix: string;
  }>,
): Response {
  const storageKey = safeStorageKey(file.storageKey);
  const prefix = input.internalPrefix.trim().replace(/\/+$/u, '');
  if (!/^\/[A-Za-z0-9/_-]+$/u.test(prefix) || prefix.includes('..')) {
    throw new KernelConfigurationError(
      'KERNEL_X_SENDFILE_UNSAFE',
      'Az internal file-offload prefix abszolút, traversalmentes URI path legyen.',
    );
  }
  const header = input.mode === 'x-accel-redirect' ? 'X-Accel-Redirect' : 'X-Sendfile';
  return new Response(null, {
    status: 200,
    headers: {
      [header]: `${prefix}/${storageKey.split('/').map(encodeURIComponent).join('/')}`,
      'Content-Type': file.contentType,
      'Content-Disposition': `attachment; filename="${contentDispositionFilename(file.downloadName)}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
