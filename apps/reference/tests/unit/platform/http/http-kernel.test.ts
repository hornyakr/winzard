import { describe, expect, it, vi } from 'vitest';

import { defineRouteContract } from '@/platform/http/delivery-contract';
import { withRouteLifecycle } from '@/platform/http/http-kernel.server';
import type {
  IdempotencyExecutionInput,
  IdempotencyExecutor,
} from '@/platform/http/idempotency.server';
import type {
  KernelCompletionEvent,
  KernelFailureEvent,
} from '@/platform/http/kernel-telemetry.server';
import type { RateLimitExecutor } from '@/platform/http/rate-limit.server';
import type { RequestContext } from '@/platform/http/request-context';

const authenticatedContext: RequestContext = Object.freeze({
  requestId: 'kernel-test-request',
  actor: Object.freeze({
    kind: 'user',
    userId: 'kernel-test-user',
    roles: Object.freeze(['operator']),
  }),
  locale: 'hu',
  receivedAt: '2026-07-21T10:00:00.000Z',
});

function postContract(
  idempotency: 'none' | 'required' = 'none',
  rateLimit = 'none',
) {
  return defineRouteContract({
    kind: 'route-handler',
    id: 'test.kernel.post',
    route: '/api/kernel/test',
    methods: ['POST'],
    runtime: 'nodejs',
    requestContext: 'required',
    authentication: 'required',
    tenant: 'none',
    authorization: { POST: 'test.kernel.execute' },
    cache: 'private-no-store',
    responsePolicy: 'api-private',
    csrf: 'same-origin',
    idempotency,
    rateLimit,
    bodyLimitBytes: 4_096,
    streaming: false,
    operations: { POST: 'test.commands.execute' },
    presenters: { POST: 'presentTestHttp' },
    responseSchemas: { POST: 'TestHttpDto@1' },
    errors: [
      'AUTHENTICATION_REQUIRED',
      'CSRF_VALIDATION_FAILED',
      'IDEMPOTENCY_EXECUTOR_MISSING',
      'IDEMPOTENCY_KEY_INVALID',
      'INTERNAL_ERROR',
    ],
  } as const);
}

function getContract() {
  return defineRouteContract({
    kind: 'route-handler',
    id: 'test.kernel.get',
    route: '/api/kernel/test',
    methods: ['GET'],
    runtime: 'nodejs',
    requestContext: 'required',
    authentication: 'public',
    tenant: 'none',
    authorization: { GET: 'none' },
    cache: 'no-store',
    responsePolicy: 'health',
    csrf: 'none',
    idempotency: 'none',
    rateLimit: 'none',
    streaming: false,
    operations: { GET: 'test.queries.read' },
    responseSchemas: { GET: 'TestHttpDto@1' },
    errors: ['INTERNAL_ERROR'],
  } as const);
}

describe('Route Handler lifecycle', () => {
  it('egyszer olvassa a body-t, alkalmazza a response-policyt és after telemetryt ütemez', async () => {
    const afterTasks: Array<() => void | Promise<void>> = [];
    const completions: KernelCompletionEvent[] = [];
    const failures: KernelFailureEvent[] = [];
    let clock = 100;
    const handler = withRouteLifecycle(
      postContract(),
      'POST',
      async (_request, _context, invocation) => {
        const [first, second] = await Promise.all([
          invocation.readJsonBody(),
          invocation.readJsonBody(),
        ]);
        expect(first).toBe(second);
        expect(invocation.applicationContext.actor).toBe(
          invocation.requestContext.actor,
        );
        return Response.json({ ok: true, body: first }, { status: 201 });
      },
      {
        createRequestContext: async () => authenticatedContext,
        scheduleAfterResponse: (task) => { afterTasks.push(task); },
        telemetry: {
          recordCompletion: (event) => { completions.push(event); },
          recordFailure: (event) => { failures.push(event); },
        },
        now: () => { clock += 5; return clock; },
      },
    );

    const response = await handler(new Request('http://localhost/api/kernel/test', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
        'sec-fetch-site': 'same-origin',
      },
      body: JSON.stringify({ value: 1 }),
    }), undefined);

    expect(response.status).toBe(201);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('X-Request-Id')).toBe('kernel-test-request');
    expect(afterTasks).toHaveLength(1);
    await afterTasks[0]?.();
    expect(failures).toHaveLength(0);
    expect(completions).toContainEqual(expect.objectContaining({
      contractId: 'test.kernel.post',
      requestId: 'kernel-test-request',
      status: 201,
      outcome: 'success',
      operation: 'test.commands.execute',
    }));
  });

  it('redaktált 500-as Problem Details választ és failure telemetryt ad váratlan hibára', async () => {
    const afterTasks: Array<() => void | Promise<void>> = [];
    const failures: KernelFailureEvent[] = [];
    const handler = withRouteLifecycle(
      getContract(),
      'GET',
      () => {
        throw new Error('database password=secret');
      },
      {
        createRequestContext: async () => authenticatedContext,
        scheduleAfterResponse: (task) => { afterTasks.push(task); },
        telemetry: {
          recordCompletion: () => undefined,
          recordFailure: (event) => { failures.push(event); },
        },
        now: () => 1,
      },
    );

    const response = await handler(
      new Request('http://localhost/api/kernel/test'),
      undefined,
    );
    const body = await response.json() as Record<string, unknown>;
    await afterTasks[0]?.();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      code: 'INTERNAL_ERROR',
      requestId: 'kernel-test-request',
    });
    expect(JSON.stringify(body)).not.toContain('password=secret');
    expect(failures).toEqual([expect.objectContaining({
      errorName: 'Error',
      requestId: 'kernel-test-request',
    })]);
  });

  it('fail-closed rate-limit porton keresztül ad 429-et és Retry-After headert', async () => {
    const operation = vi.fn(async () => Response.json({ ok: true }));
    const executor: RateLimitExecutor = Object.freeze({
      consume: async () => ({ allowed: false, retryAfterSeconds: 17 }),
    });
    const handler = withRouteLifecycle(
      postContract('none', 'write-standard'),
      'POST',
      operation,
      {
        createRequestContext: async () => authenticatedContext,
        scheduleAfterResponse: () => undefined,
        telemetry: {
          recordCompletion: () => undefined,
          recordFailure: () => undefined,
        },
        rateLimitExecutor: executor,
        now: () => 1,
      },
    );

    const response = await handler(new Request('http://localhost/api/kernel/test', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      body: JSON.stringify({ value: 1 }),
    }), undefined);
    const body = await response.json() as { code: string };

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('17');
    expect(body.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(operation).not.toHaveBeenCalled();
  });

  it('500-zal áll le, ha név szerinti rate-limit policy mögött nincs executor', async () => {
    const operation = vi.fn(async () => Response.json({ ok: true }));
    const handler = withRouteLifecycle(
      postContract('none', 'write-standard'),
      'POST',
      operation,
      {
        createRequestContext: async () => authenticatedContext,
        scheduleAfterResponse: () => undefined,
        telemetry: {
          recordCompletion: () => undefined,
          recordFailure: () => undefined,
        },
        now: () => 1,
      },
    );

    const response = await handler(new Request('http://localhost/api/kernel/test', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      body: JSON.stringify({ value: 1 }),
    }), undefined);
    const body = await response.json() as { code: string };

    expect(response.status).toBe(500);
    expect(body.code).toBe('RATE_LIMIT_EXECUTOR_MISSING');
    expect(operation).not.toHaveBeenCalled();
  });

  it('a durable idempotency executoron keresztül futtatja a mutationt', async () => {
    const executions: IdempotencyExecutionInput[] = [];
    const operation = vi.fn(async () => Response.json({ ok: true }));
    const executor: IdempotencyExecutor = Object.freeze({
      async execute(
        input: IdempotencyExecutionInput,
        execute: () => Promise<Response>,
      ) {
        executions.push(input);
        return execute();
      },
    });
    const handler = withRouteLifecycle(
      postContract('required'),
      'POST',
      operation,
      {
        createRequestContext: async () => authenticatedContext,
        scheduleAfterResponse: () => undefined,
        telemetry: {
          recordCompletion: () => undefined,
          recordFailure: () => undefined,
        },
        idempotencyExecutor: executor,
        now: () => 1,
      },
    );

    const response = await handler(new Request('http://localhost/api/kernel/test', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'request-001',
        origin: 'http://localhost',
      },
      body: JSON.stringify({ value: 1 }),
    }), undefined);

    expect(response.status).toBe(200);
    expect(operation).toHaveBeenCalledOnce();
    expect(executions).toEqual([expect.objectContaining({
      contractId: 'test.kernel.post',
      key: 'request-001',
      actorScope: 'user:kernel-test-user',
      requestFingerprint: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
    })]);
  });

  it('fail-closed 500-at ad, ha idempotency deklarált, de nincs durable executor', async () => {
    const operation = vi.fn(async () => Response.json({ ok: true }));
    const handler = withRouteLifecycle(
      postContract('required'),
      'POST',
      operation,
      {
        createRequestContext: async () => authenticatedContext,
        scheduleAfterResponse: () => undefined,
        telemetry: {
          recordCompletion: () => undefined,
          recordFailure: () => undefined,
        },
        now: () => 1,
      },
    );

    const response = await handler(new Request('http://localhost/api/kernel/test', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'request-001',
        origin: 'http://localhost',
      },
      body: JSON.stringify({ value: 1 }),
    }), undefined);
    const body = await response.json() as { code: string };

    expect(response.status).toBe(500);
    expect(body.code).toBe('IDEMPOTENCY_EXECUTOR_MISSING');
    expect(operation).not.toHaveBeenCalled();
  });
});
