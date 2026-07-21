import 'server-only';

import type { HttpMethod, IdempotencyPolicy } from './delivery-contract';
import type { RequestContext } from './request-context';

const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

export class IdempotencyKeyError extends Error {
  readonly code = 'IDEMPOTENCY_KEY_INVALID';

  constructor() {
    super('A valid Idempotency-Key header is required.');
    this.name = 'IdempotencyKeyError';
  }
}

export class IdempotencyExecutorMissingError extends Error {
  readonly code = 'IDEMPOTENCY_EXECUTOR_MISSING';

  constructor() {
    super('The route declares idempotency but no durable executor is configured.');
    this.name = 'IdempotencyExecutorMissingError';
  }
}

export type IdempotencyExecutionInput = Readonly<{
  contractId: string;
  method: HttpMethod;
  key: string;
  requestFingerprint: string;
  actorScope: string;
  tenantId?: string;
  requestId: string;
}>;

export interface IdempotencyExecutor {
  execute(
    input: IdempotencyExecutionInput,
    operation: () => Promise<Response>,
  ): Promise<Response>;
}

export function resolveIdempotencyKey(
  request: Request,
  policy: IdempotencyPolicy,
): string | undefined {
  if (policy === 'none') return undefined;
  const value = request.headers.get('idempotency-key')?.trim();
  if (!value) {
    if (policy === 'required') throw new IdempotencyKeyError();
    return undefined;
  }
  if (!IDEMPOTENCY_KEY.test(value)) throw new IdempotencyKeyError();
  return value;
}

export function idempotencyActorScope(context: RequestContext): string {
  if (context.actor.kind === 'user') return `user:${context.actor.userId}`;
  if (context.actor.kind === 'service') return `service:${context.actor.serviceId}`;
  return 'anonymous';
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export async function fingerprintIdempotentRequest(
  request: Request,
  method: HttpMethod,
  body: Uint8Array,
): Promise<string> {
  const url = new URL(request.url);
  const metadata = new TextEncoder().encode([
    method,
    `${url.pathname}${url.search}`,
    request.headers.get('content-type')?.trim().toLowerCase() ?? '',
    '',
  ].join('\n'));
  const input = new Uint8Array(metadata.byteLength + body.byteLength);
  input.set(metadata, 0);
  input.set(body, metadata.byteLength);
  const digest = await crypto.subtle.digest('SHA-256', input);
  return `sha256:${bytesToHex(new Uint8Array(digest))}`;
}
