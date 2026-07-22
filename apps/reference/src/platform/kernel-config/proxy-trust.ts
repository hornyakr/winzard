import { KernelConfigurationError } from './kernel-config.errors';

export const forwardedRequestHeaders = Object.freeze([
  'forwarded',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-port',
  'x-forwarded-prefix',
  'x-forwarded-proto',
] as const);

export type ProxyTrustPolicy =
  | Readonly<{ mode: 'none' }>
  | Readonly<{ mode: 'fixed-hops'; hops: number }>
  | Readonly<{ mode: 'cidr'; cidrs: readonly string[] }>;

function integer(value: string | undefined, fallback: number): number {
  const raw = value ?? String(fallback);
  if (!/^\d+$/u.test(raw)) {
    throw new KernelConfigurationError(
      'KERNEL_TRUSTED_HEADER_UNSAFE',
      'TRUSTED_PROXY_HOPS pozitív egész szám legyen.',
    );
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 8) {
    throw new KernelConfigurationError(
      'KERNEL_TRUSTED_HEADER_UNSAFE',
      'TRUSTED_PROXY_HOPS 1 és 8 közötti egész szám legyen.',
    );
  }
  return parsed;
}

function parseIpv4(value: string): Uint8Array | null {
  const parts = value.split('.');
  if (parts.length !== 4) return null;
  const bytes = parts.map((part) => {
    if (!/^(0|[1-9]\d{0,2})$/u.test(part)) return -1;
    const parsed = Number(part);
    return parsed <= 255 ? parsed : -1;
  });
  return bytes.some((value) => value < 0) ? null : Uint8Array.from(bytes);
}

function parseIpv6(value: string): Uint8Array | null {
  let input = value.toLowerCase();
  const zone = input.indexOf('%');
  if (zone >= 0) input = input.slice(0, zone);
  const ipv4Match = /(?:^|:)(\d+\.\d+\.\d+\.\d+)$/u.exec(input);
  let ipv4: Uint8Array | null = null;
  if (ipv4Match?.[1]) {
    ipv4 = parseIpv4(ipv4Match[1]);
    if (!ipv4) return null;
    input = `${input.slice(0, -ipv4Match[1].length)}${((ipv4[0] ?? 0) << 8 | (ipv4[1] ?? 0)).toString(16)}:${((ipv4[2] ?? 0) << 8 | (ipv4[3] ?? 0)).toString(16)}`;
  }
  const halves = input.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
  const groups = [...left, ...Array.from({ length: missing }, () => '0'), ...right];
  if (groups.length !== 8) return null;
  const output = new Uint8Array(16);
  for (const [index, group] of groups.entries()) {
    if (!/^[0-9a-f]{1,4}$/u.test(group)) return null;
    const parsed = Number.parseInt(group, 16);
    output[index * 2] = parsed >> 8;
    output[index * 2 + 1] = parsed & 255;
  }
  return output;
}

function ipFamily(value: string): 0 | 4 | 6 {
  if (parseIpv4(value)) return 4;
  return parseIpv6(value) ? 6 : 0;
}

function addressBytes(value: string): Uint8Array | null {
  const ipv4 = parseIpv4(value);
  if (ipv4) {
    return Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 255, ...ipv4]);
  }
  return parseIpv6(value);
}

export function normalizeIpAddress(raw: string): string {
  let value = raw.trim().replace(/^"|"$/gu, '');
  if (value.toLowerCase() === 'unknown' || value.startsWith('_')) {
    throw new KernelConfigurationError(
      'KERNEL_TRUSTED_HEADER_UNSAFE',
      'Az obfuscated vagy unknown forwardolt cím nem használható klienscímként.',
    );
  }
  if (value.startsWith('[')) {
    const closing = value.indexOf(']');
    if (closing < 0) {
      throw new KernelConfigurationError(
        'KERNEL_TRUSTED_HEADER_UNSAFE',
        'A bracketelt IPv6 cím lezáró karaktere hiányzik.',
      );
    }
    value = value.slice(1, closing);
  } else if (/^\d+\.\d+\.\d+\.\d+:\d+$/u.test(value)) {
    value = value.slice(0, value.lastIndexOf(':'));
  }
  if (!addressBytes(value)) {
    throw new KernelConfigurationError(
      'KERNEL_TRUSTED_HEADER_UNSAFE',
      `Érvénytelen IP-cím a forwardolt láncban: ${raw}.`,
    );
  }
  return value.toLowerCase();
}

function splitQuoted(value: string, separator: ',' | ';'): readonly string[] {
  const output: string[] = [];
  let current = '';
  let quoted = false;
  let escaped = false;
  for (const character of value) {
    if (escaped) {
      current += character;
      escaped = false;
    } else if (character === '\\' && quoted) {
      current += character;
      escaped = true;
    } else if (character === '"') {
      quoted = !quoted;
      current += character;
    } else if (character === separator && !quoted) {
      output.push(current.trim());
      current = '';
    } else {
      current += character;
    }
  }
  if (quoted) {
    throw new KernelConfigurationError(
      'KERNEL_TRUSTED_HEADER_UNSAFE',
      'Lezáratlan idézőjel a Forwarded headerben.',
    );
  }
  output.push(current.trim());
  return output.filter(Boolean);
}

export function parseForwardedFor(value: string): readonly string[] {
  if (/[\u0000-\u001f\u007f]/u.test(value) || value.length > 8192) {
    throw new KernelConfigurationError(
      'KERNEL_TRUSTED_HEADER_UNSAFE',
      'A Forwarded header tiltott karaktert tartalmaz vagy túl hosszú.',
    );
  }
  const addresses: string[] = [];
  for (const element of splitQuoted(value, ',')) {
    const parameters = new Map<string, string>();
    for (const part of splitQuoted(element, ';')) {
      const separator = part.indexOf('=');
      if (separator <= 0) {
        throw new KernelConfigurationError(
          'KERNEL_TRUSTED_HEADER_UNSAFE',
          'A Forwarded parameter key=value formátumú legyen.',
        );
      }
      const key = part.slice(0, separator).trim().toLowerCase();
      const parameterValue = part.slice(separator + 1).trim();
      if (parameters.has(key)) {
        throw new KernelConfigurationError(
          'KERNEL_TRUSTED_HEADER_UNSAFE',
          `Duplikált Forwarded parameter: ${key}.`,
        );
      }
      parameters.set(key, parameterValue);
    }
    const forwardedFor = parameters.get('for');
    if (forwardedFor) addresses.push(normalizeIpAddress(forwardedFor));
  }
  return Object.freeze(addresses);
}

export function parseForwardedChain(headers: Headers): readonly string[] {
  const forwarded = headers.get('forwarded');
  if (forwarded) return parseForwardedFor(forwarded);
  const xForwardedFor = headers.get('x-forwarded-for');
  if (!xForwardedFor) return [];
  if (/[\u0000-\u001f\u007f]/u.test(xForwardedFor) || xForwardedFor.length > 8192) {
    throw new KernelConfigurationError(
      'KERNEL_TRUSTED_HEADER_UNSAFE',
      'Az X-Forwarded-For tiltott karaktert tartalmaz vagy túl hosszú.',
    );
  }
  return Object.freeze(xForwardedFor.split(',').map(normalizeIpAddress));
}

function cidrContains(cidr: string, address: string): boolean {
  const [networkRaw = '', prefixRaw = ''] = cidr.split('/');
  const network = addressBytes(networkRaw);
  const target = addressBytes(address);
  if (!network || !target || !/^\d+$/u.test(prefixRaw)) return false;
  const ipv4Network = parseIpv4(networkRaw) !== null;
  const prefixInput = Number(prefixRaw);
  const prefix = ipv4Network ? prefixInput + 96 : prefixInput;
  if (prefixInput < 0 || prefixInput > (ipv4Network ? 32 : 128)) return false;
  for (let bit = 0; bit < prefix; bit += 1) {
    const byte = Math.floor(bit / 8);
    const mask = 1 << (7 - (bit % 8));
    if (((network[byte] ?? 0) & mask) !== ((target[byte] ?? 0) & mask)) return false;
  }
  return true;
}

export function createProxyTrustPolicy(
  input: NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>> = process.env,
): ProxyTrustPolicy {
  const mode = input.TRUSTED_PROXY_MODE?.trim() || 'none';
  if (mode === 'none') return Object.freeze({ mode: 'none' });
  if (mode === 'fixed-hops') {
    return Object.freeze({ mode, hops: integer(input.TRUSTED_PROXY_HOPS, 1) });
  }
  if (mode === 'cidr') {
    const cidrs = (input.TRUSTED_PROXY_CIDRS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (cidrs.length === 0) {
      throw new KernelConfigurationError(
        'KERNEL_TRUSTED_HEADER_UNSAFE',
        'CIDR trust módhoz TRUSTED_PROXY_CIDRS szükséges.',
      );
    }
    if (cidrs.includes('0.0.0.0/0') || cidrs.includes('::/0')) {
      throw new KernelConfigurationError(
        'KERNEL_TRUSTED_PROXY_TOO_BROAD',
        'A teljes internetet lefedő trusted proxy CIDR tiltott.',
      );
    }
    for (const cidr of cidrs) {
      const [address = '', prefix = ''] = cidr.split('/');
      const family = ipFamily(address);
      const maximum = family === 4 ? 32 : family === 6 ? 128 : -1;
      if (maximum < 0 || !/^\d+$/u.test(prefix) || Number(prefix) > maximum) {
        throw new KernelConfigurationError(
          'KERNEL_TRUSTED_HEADER_UNSAFE',
          `Érvénytelen trusted proxy CIDR: ${cidr}.`,
        );
      }
    }
    return Object.freeze({ mode, cidrs: Object.freeze(cidrs) });
  }
  throw new KernelConfigurationError(
    'KERNEL_TRUSTED_HEADER_UNSAFE',
    `Ismeretlen TRUSTED_PROXY_MODE: ${mode}.`,
  );
}

function proxyIsTrusted(policy: ProxyTrustPolicy, address: string): boolean {
  return policy.mode === 'cidr' && policy.cidrs.some((cidr) => cidrContains(cidr, address));
}

export function resolveClientAddress(input: Readonly<{
  headers: Headers;
  peerAddress?: string;
  policy: ProxyTrustPolicy;
}>): string | undefined {
  const peer = input.peerAddress ? normalizeIpAddress(input.peerAddress) : undefined;
  if (input.policy.mode === 'none') return peer;
  if (!peer) {
    throw new KernelConfigurationError(
      'KERNEL_TRUSTED_HEADER_UNSAFE',
      'Trusted proxy módhoz az ingress peer address szükséges.',
    );
  }
  const forwarded = [...parseForwardedChain(input.headers)];
  if (input.policy.mode === 'fixed-hops') {
    const chain = [...forwarded, peer];
    const index = chain.length - input.policy.hops - 1;
    if (index < 0) {
      throw new KernelConfigurationError(
        'KERNEL_TRUSTED_HEADER_UNSAFE',
        'A forwardolt lánc rövidebb a konfigurált proxy hop countnál.',
      );
    }
    return chain[index];
  }
  if (!proxyIsTrusted(input.policy, peer)) return peer;
  let candidate = peer;
  for (let index = forwarded.length - 1; index >= 0; index -= 1) {
    const address = forwarded[index];
    if (!address) continue;
    candidate = address;
    if (!proxyIsTrusted(input.policy, address)) break;
  }
  return candidate;
}
