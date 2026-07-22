import { KernelConfigurationError } from './kernel-config.errors';
import type { ApplicationStage } from './runtime-environment';

export type NormalizedHost = Readonly<{
  hostname: string;
  port?: number;
  authority: string;
}>;

export type HostPattern = Readonly<{
  kind: 'exact' | 'single-label-wildcard';
  hostname: string;
  port?: number;
  source: string;
}>;

export type HostPolicy = Readonly<{
  canonicalOrigin: URL;
  trustedHosts: readonly HostPattern[];
  serverActionAllowedOrigins: readonly string[];
}>;

function hasUnsafeCharacters(value: string): boolean {
  return /[\u0000-\u0020\u007f,/@\\]/u.test(value);
}

export function normalizeHost(value: string): NormalizedHost {
  const input = value.trim();
  if (!input || input.length > 253 || hasUnsafeCharacters(input)) {
    throw new KernelConfigurationError(
      'KERNEL_HOST_HEADER_INJECTION',
      'A Host header üres, túl hosszú vagy tiltott karaktert tartalmaz.',
    );
  }
  let hostname: string;
  let port: number | undefined;
  try {
    const url = new URL(`http://${input}`);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('invalid authority');
    }
    hostname = url.hostname.endsWith('.') ? url.hostname.slice(0, -1) : url.hostname;
    if (hostname.startsWith('[') && hostname.endsWith(']')) {
      hostname = hostname.slice(1, -1).toLowerCase();
    } else {
      hostname = hostname.toLowerCase();
    }
    if (!hostname) throw new Error('empty host');
    if (url.port) {
      port = Number(url.port);
      if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('invalid port');
    }
  } catch {
    throw new KernelConfigurationError(
      'KERNEL_HOST_HEADER_INJECTION',
      'A Host header nem érvényes HTTP authority.',
    );
  }
  const bracketed = hostname.includes(':') ? `[${hostname}]` : hostname;
  return Object.freeze({
    hostname,
    ...(port === undefined ? {} : { port }),
    authority: port === undefined ? bracketed : `${bracketed}:${port}`,
  });
}

function parsePattern(value: string): HostPattern {
  const source = value.trim();
  if (source.startsWith('*.')) {
    const normalized = normalizeHost(source.slice(2));
    return Object.freeze({
      kind: 'single-label-wildcard',
      hostname: normalized.hostname,
      ...(normalized.port === undefined ? {} : { port: normalized.port }),
      source,
    });
  }
  const normalized = normalizeHost(source);
  return Object.freeze({
    kind: 'exact',
    hostname: normalized.hostname,
    ...(normalized.port === undefined ? {} : { port: normalized.port }),
    source,
  });
}

function matchesPattern(host: NormalizedHost, pattern: HostPattern): boolean {
  if (pattern.port !== undefined && host.port !== pattern.port) return false;
  if (pattern.kind === 'exact') return host.hostname === pattern.hostname;
  if (!host.hostname.endsWith(`.${pattern.hostname}`)) return false;
  const prefix = host.hostname.slice(0, -(pattern.hostname.length + 1));
  return prefix.length > 0 && !prefix.includes('.');
}

export function createHostPolicy(
  input: NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>>,
  stage: ApplicationStage,
): HostPolicy {
  const rawOrigin = input.APP_URL?.trim();
  if (!rawOrigin) {
    throw new KernelConfigurationError(
      'KERNEL_TRUSTED_HOST_MISSING',
      'APP_URL szükséges a canonical originhez.',
    );
  }
  let canonicalOrigin: URL;
  try {
    canonicalOrigin = new URL(rawOrigin);
  } catch {
    throw new KernelConfigurationError(
      'KERNEL_TRUSTED_HOST_MISSING',
      'APP_URL érvényes URL legyen.',
    );
  }
  if (
    !['http:', 'https:'].includes(canonicalOrigin.protocol) ||
    canonicalOrigin.username ||
    canonicalOrigin.password ||
    canonicalOrigin.pathname !== '/' ||
    canonicalOrigin.search ||
    canonicalOrigin.hash
  ) {
    throw new KernelConfigurationError(
      'KERNEL_TRUSTED_HOST_MISSING',
      'APP_URL credentialmentes HTTP(S) origin legyen.',
    );
  }
  if (stage === 'production' && canonicalOrigin.protocol !== 'https:') {
    throw new KernelConfigurationError(
      'KERNEL_TRUSTED_HOST_MISSING',
      'Production canonical origin kizárólag HTTPS lehet.',
    );
  }
  const canonicalAuthority = normalizeHost(canonicalOrigin.host).authority;
  const trustedSource = input.TRUSTED_HOSTS?.trim() || canonicalAuthority;
  const trustedHosts = trustedSource.split(',').map(parsePattern);
  if (trustedHosts.length === 0) {
    throw new KernelConfigurationError(
      'KERNEL_TRUSTED_HOST_MISSING',
      'Legalább egy trusted host szükséges.',
    );
  }
  if (!trustedHosts.some((pattern) => matchesPattern(normalizeHost(canonicalAuthority), pattern))) {
    throw new KernelConfigurationError(
      'KERNEL_TRUSTED_HOST_MISSING',
      'A canonical APP_URL hostja szerepeljen a TRUSTED_HOSTS listában.',
    );
  }
  const allowedOrigins = (input.SERVER_ACTION_ALLOWED_ORIGINS?.trim() || canonicalAuthority)
    .split(',')
    .map((value) => parsePattern(value).source);
  return Object.freeze({
    canonicalOrigin,
    trustedHosts: Object.freeze(trustedHosts),
    serverActionAllowedOrigins: Object.freeze(allowedOrigins),
  });
}

export function assertTrustedHost(hostValue: string | null, policy: HostPolicy): NormalizedHost {
  if (!hostValue) {
    throw new KernelConfigurationError(
      'KERNEL_HOST_HEADER_INJECTION',
      'A Host header kötelező.',
    );
  }
  const host = normalizeHost(hostValue);
  if (!policy.trustedHosts.some((pattern) => matchesPattern(host, pattern))) {
    throw new KernelConfigurationError(
      'KERNEL_HOST_HEADER_INJECTION',
      'A request Host értéke nincs a trusted host allowlistben.',
    );
  }
  return host;
}
