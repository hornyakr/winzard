import 'server-only';

import { Buffer } from 'node:buffer';

import { KernelConfigurationError } from './kernel-config.errors';

export type SecretKeyring = Readonly<{
  capability: string;
  activeKeyId: string;
  previousKeyIds: readonly string[];
  keys: ReadonlyMap<string, Uint8Array>;
  graceUntil?: string;
}>;

const KEY_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u;

function decodeKey(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new KernelConfigurationError(
      'KERNEL_SECRET_ROTATION_INVALID',
      'A keyring kulcsanyaga canonical base64url string legyen.',
    );
  }
  const bytes = Buffer.from(value, 'base64url');
  if (Buffer.from(bytes).toString('base64url') !== value) {
    throw new KernelConfigurationError(
      'KERNEL_SECRET_ROTATION_INVALID',
      'A keyring kulcsanyaga canonical base64url string legyen.',
    );
  }
  if (bytes.byteLength < 32 || new Set(bytes).size < 8) {
    throw new KernelConfigurationError(
      'KERNEL_SECRET_PLACEHOLDER',
      'A keyring legalább 32 byte-os, generált és megfelelő változatosságú kulcsot igényel.',
    );
  }
  return bytes;
}

function immutableKeyMap(
  source: ReadonlyMap<string, Uint8Array>,
): ReadonlyMap<string, Uint8Array> {
  const copy = (value: Uint8Array): Uint8Array => Uint8Array.from(value);
  const view: ReadonlyMap<string, Uint8Array> = Object.freeze({
    get size(): number {
      return source.size;
    },
    has(key: string): boolean {
      return source.has(key);
    },
    get(key: string): Uint8Array | undefined {
      const value = source.get(key);
      return value ? copy(value) : undefined;
    },
    forEach(
      callback: (value: Uint8Array, key: string, map: ReadonlyMap<string, Uint8Array>) => void,
      thisArg?: unknown,
    ): void {
      source.forEach((value, key) => callback.call(thisArg, copy(value), key, view));
    },
    entries(): MapIterator<[string, Uint8Array]> {
      return new Map([...source].map(([key, value]) => [key, copy(value)] as const)).entries();
    },
    keys(): MapIterator<string> {
      return new Map(source).keys();
    },
    values(): MapIterator<Uint8Array> {
      return new Map([...source].map(([key, value]) => [key, copy(value)] as const)).values();
    },
    [Symbol.iterator](): MapIterator<[string, Uint8Array]> {
      return this.entries();
    },
  });
  return view;
}

export function createSecretKeyring(input: Readonly<{
  capability: string;
  activeKeyId: string;
  previousKeyIds?: readonly string[];
  keys: Readonly<Record<string, string>>;
  graceUntil?: string;
}>): SecretKeyring {
  const activeKeyId = input.activeKeyId.trim();
  if (!KEY_ID.test(activeKeyId)) {
    throw new KernelConfigurationError(
      'KERNEL_SECRET_ROTATION_INVALID',
      'Az aktív key ID nem hordozható azonosító.',
    );
  }
  const previous = [...new Set(input.previousKeyIds ?? [])];
  if (previous.includes(activeKeyId) || previous.some((value) => !KEY_ID.test(value))) {
    throw new KernelConfigurationError(
      'KERNEL_SECRET_ROTATION_INVALID',
      'A previous key ID lista hibás vagy tartalmazza az aktív kulcsot.',
    );
  }
  const keys = new Map<string, Uint8Array>();
  for (const [keyId, material] of Object.entries(input.keys)) {
    if (!KEY_ID.test(keyId) || keys.has(keyId)) {
      throw new KernelConfigurationError(
        'KERNEL_SECRET_ROTATION_INVALID',
        'A keyring duplikált vagy érvénytelen key ID-t tartalmaz.',
      );
    }
    keys.set(keyId, decodeKey(material));
  }
  for (const required of [activeKeyId, ...previous]) {
    if (!keys.has(required)) {
      throw new KernelConfigurationError(
        'KERNEL_SECRET_ROTATION_INVALID',
        'A keyringből hiányzik egy aktív vagy previous key ID kulcsanyaga.',
      );
    }
  }
  if (input.graceUntil && !Number.isFinite(Date.parse(input.graceUntil))) {
    throw new KernelConfigurationError(
      'KERNEL_SECRET_ROTATION_INVALID',
      'A graceUntil érvényes ISO-8601 dátum legyen.',
    );
  }
  return Object.freeze({
    capability: input.capability,
    activeKeyId,
    previousKeyIds: Object.freeze(previous),
    keys: immutableKeyMap(keys),
    ...(input.graceUntil ? { graceUntil: input.graceUntil } : {}),
  });
}

export function readSecretKeyring(
  prefix: string,
  input: NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>> = process.env,
): SecretKeyring {
  const normalizedPrefix = prefix.trim().toUpperCase().replace(/[^A-Z0-9]+/gu, '_');
  const active = input[`${normalizedPrefix}_ACTIVE_KEY_ID`];
  const encoded = input[`${normalizedPrefix}_KEYS`];
  if (!active || !encoded) {
    throw new KernelConfigurationError(
      'KERNEL_SECRET_ROTATION_INVALID',
      `${normalizedPrefix} keyring konfiguráció hiányzik.`,
    );
  }
  let keys: Record<string, string>;
  try {
    const parsed = JSON.parse(encoded) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error();
    keys = Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    );
    if (Object.keys(keys).length !== Object.keys(parsed).length) throw new Error();
  } catch {
    throw new KernelConfigurationError(
      'KERNEL_SECRET_ROTATION_INVALID',
      `${normalizedPrefix}_KEYS stringértékeket tartalmazó JSON objektum legyen.`,
    );
  }
  return createSecretKeyring({
    capability: prefix,
    activeKeyId: active,
    previousKeyIds: (input[`${normalizedPrefix}_PREVIOUS_KEY_IDS`] ?? '')
      .split(',').map((value) => value.trim()).filter(Boolean),
    keys,
    ...(input[`${normalizedPrefix}_GRACE_UNTIL`]
      ? { graceUntil: input[`${normalizedPrefix}_GRACE_UNTIL`] }
      : {}),
  });
}
