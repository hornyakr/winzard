import 'server-only';

import type { HttpMethod } from './delivery-contract';
import type { RequestContext } from './request-context';

export type RateLimitExecutionInput = Readonly<{
  contractId: string;
  policy: string;
  method: HttpMethod;
  actorScope: string;
  tenantId?: string;
  requestId: string;
}>;

export type RateLimitDecision =
  | Readonly<{ allowed: true }>
  | Readonly<{ allowed: false; retryAfterSeconds?: number }>;

export interface RateLimitExecutor {
  consume(input: RateLimitExecutionInput): RateLimitDecision | Promise<RateLimitDecision>;
}

export class RateLimitExecutorMissingError extends Error {
  readonly code = 'RATE_LIMIT_EXECUTOR_MISSING';

  constructor() {
    super('The route declares a rate-limit policy but no executor is configured.');
    this.name = 'RateLimitExecutorMissingError';
  }
}

export class RateLimitExceededError extends Error {
  readonly code = 'RATE_LIMIT_EXCEEDED';

  constructor(readonly retryAfterSeconds?: number) {
    super('The request exceeded its configured rate limit.');
    this.name = 'RateLimitExceededError';
  }
}

export function rateLimitActorScope(context: RequestContext): string {
  if (context.actor.kind === 'user') return `user:${context.actor.userId}`;
  if (context.actor.kind === 'service') return `service:${context.actor.serviceId}`;
  return 'anonymous';
}

function validRetryAfter(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  return Number.isSafeInteger(value) && value >= 1 && value <= 86_400
    ? value
    : undefined;
}

export async function enforceRateLimit(
  input: Readonly<{
    contractId: string;
    policy: string;
    method: HttpMethod;
    requestContext: RequestContext;
  }>,
  executor: RateLimitExecutor | undefined,
): Promise<void> {
  if (input.policy === 'none') return;
  if (!executor) throw new RateLimitExecutorMissingError();

  const decision = await executor.consume(Object.freeze({
    contractId: input.contractId,
    policy: input.policy,
    method: input.method,
    actorScope: rateLimitActorScope(input.requestContext),
    ...(input.requestContext.tenantId
      ? { tenantId: input.requestContext.tenantId }
      : {}),
    requestId: input.requestContext.requestId,
  }));

  if (!decision.allowed) {
    throw new RateLimitExceededError(validRetryAfter(decision.retryAfterSeconds));
  }
}
