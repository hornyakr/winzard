import 'server-only';

import type { ApplicationContext } from '@/application/application-context';

import { scheduleAfterResponse, type AfterResponseScheduler } from './after-response.server';
import { assertSameOriginMutation, CsrfValidationError } from './csrf.server';
import {
  assertRouteMethod,
  type HttpMethod,
  type RouteDeliveryContract,
} from './delivery-contract';
import {
  fingerprintIdempotentRequest,
  idempotencyActorScope,
  type IdempotencyExecutor,
  IdempotencyExecutorMissingError,
  IdempotencyKeyError,
  resolveIdempotencyKey,
} from './idempotency.server';
import {
  type KernelTelemetry,
  noOpKernelTelemetry,
} from './kernel-telemetry.server';
import { problem } from './problem';
import {
  enforceRateLimit,
  type RateLimitExecutor,
  RateLimitExceededError,
  RateLimitExecutorMissingError,
} from './rate-limit.server';
import {
  assertDeclaredContentLength,
  MalformedContentLengthError,
  MalformedJsonError,
  parseJsonRequestBytes,
  readRequestBytes,
  RequestAbortedError,
  RequestBodyTooLargeError,
  UnsupportedContentEncodingError,
  UnsupportedMediaTypeError,
} from './request-body.server';
import type { RequestContext } from './request-context';
import {
  createRouteRequestContext,
  toApplicationContext,
} from './request-context.server';
import { applyResponsePolicy } from './response-policy';

export type HttpKernelInvocation = Readonly<{
  requestContext: RequestContext;
  applicationContext: ApplicationContext;
  signal: AbortSignal;
  idempotencyKey?: string;
  readBodyBytes(): Promise<Uint8Array>;
  readJsonBody(): Promise<unknown>;
}>;

export type HttpKernelHandler<C> = (
  request: Request,
  routeContext: C,
  invocation: HttpKernelInvocation,
) => Response | Promise<Response>;

export type HttpKernelDependencies = Readonly<{
  createRequestContext(request: Request): Promise<RequestContext>;
  scheduleAfterResponse: AfterResponseScheduler;
  telemetry: KernelTelemetry;
  idempotencyExecutor?: IdempotencyExecutor;
  rateLimitExecutor?: RateLimitExecutor;
  now(): number;
}>;

const defaultDependencies: HttpKernelDependencies = Object.freeze({
  createRequestContext: createRouteRequestContext,
  scheduleAfterResponse,
  telemetry: noOpKernelTelemetry,
  now: () => performance.now(),
});

class AuthenticationRequiredError extends Error {
  readonly code = 'AUTHENTICATION_REQUIRED';

  constructor() {
    super('Authentication is required by the delivery contract.');
    this.name = 'AuthenticationRequiredError';
  }
}

class TenantRequiredError extends Error {
  readonly code = 'TENANT_REQUIRED';

  constructor() {
    super('A tenant scope is required by the delivery contract.');
    this.name = 'TenantRequiredError';
  }
}

function fallbackRequestContext(): RequestContext {
  return Object.freeze({
    requestId: crypto.randomUUID(),
    actor: Object.freeze({ kind: 'anonymous' }),
    locale: 'hu',
    receivedAt: new Date().toISOString(),
  });
}

function mapKernelError(error: unknown, requestId: string): Response {
  if (error instanceof RequestBodyTooLargeError) {
    return problem({
      type: 'https://winzard.invalid/problems/request-too-large',
      title: 'Request body too large',
      status: 413,
      code: error.code,
      requestId,
    });
  }
  if (error instanceof UnsupportedMediaTypeError) {
    return problem({
      type: 'https://winzard.invalid/problems/unsupported-media-type',
      title: 'Unsupported Media Type',
      status: 415,
      code: error.code,
      requestId,
    });
  }
  if (error instanceof UnsupportedContentEncodingError) {
    return problem({
      type: 'https://winzard.invalid/problems/unsupported-content-encoding',
      title: 'Unsupported Content Encoding',
      status: 415,
      code: error.code,
      requestId,
    });
  }
  if (error instanceof MalformedContentLengthError) {
    return problem({
      type: 'https://winzard.invalid/problems/content-length-invalid',
      title: 'Invalid Content-Length',
      status: 400,
      code: error.code,
      requestId,
    });
  }
  if (error instanceof MalformedJsonError) {
    return problem({
      type: 'https://winzard.invalid/problems/malformed-json',
      title: 'Malformed JSON',
      status: 400,
      code: error.code,
      requestId,
    });
  }
  if (error instanceof RequestAbortedError) {
    return problem({
      type: 'https://winzard.invalid/problems/request-aborted',
      title: 'Request aborted',
      status: 408,
      code: error.code,
      requestId,
    });
  }
  if (error instanceof CsrfValidationError) {
    return problem({
      type: 'https://winzard.invalid/problems/csrf-validation-failed',
      title: 'Forbidden',
      status: 403,
      code: error.code,
      requestId,
    });
  }
  if (error instanceof IdempotencyKeyError) {
    return problem({
      type: 'https://winzard.invalid/problems/idempotency-key-invalid',
      title: 'Invalid idempotency key',
      status: 400,
      code: error.code,
      requestId,
    });
  }
  if (error instanceof IdempotencyExecutorMissingError) {
    return problem({
      type: 'https://winzard.invalid/problems/internal-error',
      title: 'Internal Server Error',
      status: 500,
      code: error.code,
      requestId,
    });
  }
  if (error instanceof RateLimitExceededError) {
    return problem({
      type: 'https://winzard.invalid/problems/rate-limit-exceeded',
      title: 'Too Many Requests',
      status: 429,
      code: error.code,
      requestId,
      ...(error.retryAfterSeconds
        ? { headers: { 'Retry-After': String(error.retryAfterSeconds) } }
        : {}),
    });
  }
  if (error instanceof RateLimitExecutorMissingError) {
    return problem({
      type: 'https://winzard.invalid/problems/internal-error',
      title: 'Internal Server Error',
      status: 500,
      code: error.code,
      requestId,
    });
  }
  if (error instanceof AuthenticationRequiredError) {
    return problem({
      type: 'https://winzard.invalid/problems/authentication-required',
      title: 'Authentication required',
      status: 401,
      code: error.code,
      requestId,
      headers: { 'WWW-Authenticate': 'Bearer realm="winzard"' },
    });
  }
  if (error instanceof TenantRequiredError) {
    return problem({
      type: 'https://winzard.invalid/problems/not-found',
      title: 'Not Found',
      status: 404,
      code: error.code,
      requestId,
    });
  }
  return problem({
    type: 'https://winzard.invalid/problems/internal-error',
    title: 'Internal Server Error',
    status: 500,
    code: 'INTERNAL_ERROR',
    requestId,
  });
}

function isExpectedKernelError(error: unknown): boolean {
  return error instanceof RequestBodyTooLargeError ||
    error instanceof UnsupportedMediaTypeError ||
    error instanceof UnsupportedContentEncodingError ||
    error instanceof MalformedContentLengthError ||
    error instanceof MalformedJsonError ||
    error instanceof RequestAbortedError ||
    error instanceof CsrfValidationError ||
    error instanceof IdempotencyKeyError ||
    error instanceof RateLimitExceededError ||
    error instanceof AuthenticationRequiredError ||
    error instanceof TenantRequiredError;
}

function resultOutcome(status: number): 'success' | 'client-error' | 'server-error' {
  if (status >= 500) return 'server-error';
  if (status >= 400) return 'client-error';
  return 'success';
}

function resolveDependencies(
  overrides?: Partial<HttpKernelDependencies>,
): HttpKernelDependencies {
  return Object.freeze({ ...defaultDependencies, ...overrides });
}

function methodOperation(
  contract: RouteDeliveryContract,
  method: HttpMethod,
): string | undefined {
  return contract.operations?.[method];
}

async function executeWithIdempotency(
  input: Readonly<{
    request: Request;
    contract: RouteDeliveryContract;
    method: HttpMethod;
    requestContext: RequestContext;
    key?: string;
    readBodyBytes(): Promise<Uint8Array>;
  }>,
  executor: IdempotencyExecutor | undefined,
  operation: () => Promise<Response>,
): Promise<Response> {
  if (!input.key) return operation();
  if (!executor) throw new IdempotencyExecutorMissingError();

  const bytes = await input.readBodyBytes();
  return executor.execute(
    Object.freeze({
      contractId: input.contract.id,
      method: input.method,
      key: input.key,
      requestFingerprint: await fingerprintIdempotentRequest(
        input.request,
        input.method,
        bytes,
      ),
      actorScope: idempotencyActorScope(input.requestContext),
      ...(input.requestContext.tenantId
        ? { tenantId: input.requestContext.tenantId }
        : {}),
      requestId: input.requestContext.requestId,
    }),
    operation,
  );
}

export function withRouteLifecycle<C>(
  contract: RouteDeliveryContract,
  method: HttpMethod,
  handler: HttpKernelHandler<C>,
  dependencyOverrides?: Partial<HttpKernelDependencies>,
): (request: Request, context: C) => Promise<Response> {
  assertRouteMethod(contract, method);
  const dependencies = resolveDependencies(dependencyOverrides);

  return async (request: Request, routeContext: C): Promise<Response> => {
    const startedAt = dependencies.now();
    let requestContext = fallbackRequestContext();
    let unexpectedError: unknown;
    let status = 500;

    try {
      if (request.method.toUpperCase() !== method) {
        const response = problem({
          type: 'https://winzard.invalid/problems/method-not-allowed',
          title: 'Method Not Allowed',
          status: 405,
          code: 'METHOD_NOT_ALLOWED',
          requestId: requestContext.requestId,
          headers: { Allow: contract.methods.join(', ') },
        });
        status = response.status;
        return applyResponsePolicy(response, {
          policy: contract.responsePolicy,
          requestId: requestContext.requestId,
        });
      }

      requestContext = await dependencies.createRequestContext(request);
      if (
        contract.authentication === 'required' &&
        requestContext.actor.kind === 'anonymous'
      ) {
        throw new AuthenticationRequiredError();
      }
      if (contract.tenant === 'required' && !requestContext.tenantId) {
        throw new TenantRequiredError();
      }
      await enforceRateLimit(
        {
          contractId: contract.id,
          policy: contract.rateLimit,
          method,
          requestContext,
        },
        dependencies.rateLimitExecutor,
      );
      if (
        contract.csrf === 'same-origin' &&
        ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)
      ) {
        assertSameOriginMutation(request, requestContext.origin);
      }

      const idempotencyKey = resolveIdempotencyKey(request, contract.idempotency);
      if (contract.bodyLimitBytes !== undefined) {
        assertDeclaredContentLength(request, contract.bodyLimitBytes);
      }

      const maximumBodyBytes = contract.bodyLimitBytes ?? 64 * 1024;
      let bodyBytes: Promise<Uint8Array> | undefined;
      let jsonBody: Promise<unknown> | undefined;
      const readBodyBytes = (): Promise<Uint8Array> => {
        bodyBytes ??= readRequestBytes(request, maximumBodyBytes);
        return bodyBytes;
      };
      const invocation: HttpKernelInvocation = Object.freeze({
        requestContext,
        applicationContext: toApplicationContext(requestContext),
        signal: request.signal,
        ...(idempotencyKey ? { idempotencyKey } : {}),
        readBodyBytes,
        readJsonBody: () => {
          jsonBody ??= readBodyBytes().then((bytes) =>
            parseJsonRequestBytes(bytes, request.headers.get('content-type'))
          );
          return jsonBody;
        },
      });

      const executeHandler = (): Promise<Response> =>
        Promise.resolve(handler(request, routeContext, invocation));
      const response = await executeWithIdempotency(
        {
          request,
          contract,
          method,
          requestContext,
          ...(idempotencyKey ? { key: idempotencyKey } : {}),
          readBodyBytes,
        },
        dependencies.idempotencyExecutor,
        executeHandler,
      );
      if (!(response instanceof Response)) {
        throw new TypeError('A Route Handler lifecycle must return a Web Response.');
      }
      status = response.status;
      return applyResponsePolicy(response, {
        policy: contract.responsePolicy,
        requestId: requestContext.requestId,
      });
    } catch (error) {
      unexpectedError = error;
      const response = mapKernelError(error, requestContext.requestId);
      status = response.status;
      return applyResponsePolicy(response, {
        policy: contract.responsePolicy,
        requestId: requestContext.requestId,
      });
    } finally {
      const requestId = requestContext.requestId;
      const operation = methodOperation(contract, method);
      const completion = Object.freeze({
        contractId: contract.id,
        route: contract.route,
        method,
        ...(operation ? { operation } : {}),
        requestId,
        status,
        outcome: resultOutcome(status),
        durationMs: Math.max(0, dependencies.now() - startedAt),
      });

      try {
        dependencies.scheduleAfterResponse(async () => {
          if (unexpectedError && !isExpectedKernelError(unexpectedError)) {
            try {
              await dependencies.telemetry.recordFailure(Object.freeze({
                contractId: contract.id,
                route: contract.route,
                method,
                ...(operation ? { operation } : {}),
                requestId,
                errorName: unexpectedError instanceof Error
                  ? unexpectedError.name
                  : 'UnknownError',
              }));
            } catch {
              // Observability is best-effort and cannot change the completed request.
            }
          }
          try {
            await dependencies.telemetry.recordCompletion(completion);
          } catch {
            // Observability is best-effort and cannot change the completed request.
          }
        });
      } catch {
        // A scheduler failure must never alter the HTTP response.
      }
    }
  };
}

/** @deprecated Use withRouteLifecycle. */
export const withHttpKernel = withRouteLifecycle;
