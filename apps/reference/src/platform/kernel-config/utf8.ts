import { KernelConfigurationError } from './kernel-config.errors';

const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

export function decodeUtf8(bytes: Uint8Array): string {
  try {
    return utf8Decoder.decode(bytes);
  } catch {
    throw new KernelConfigurationError(
      'KERNEL_CHARSET_UNSUPPORTED',
      'A bemenet nem érvényes UTF-8 byte-sorozat.',
    );
  }
}

export function escapeSpreadsheetCell(value: string): string {
  const normalized = value.replace(/[\u0000-\u001f\u007f]/gu, '');
  return /^[=+\-@]/u.test(normalized) ? `'${normalized}` : normalized;
}
