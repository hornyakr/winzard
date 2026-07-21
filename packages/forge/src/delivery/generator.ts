import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { DeliveryGenerationKind, DeliveryGenerationResult } from './types';

type Options = Readonly<{ root?: string; dryRun?: boolean; force?: boolean }>;
type FilePlan = Readonly<{ path: string; content: string }>;

function words(value: string): readonly string[] {
  return value
    .split(/[^A-Za-z0-9]+/u)
    .filter(Boolean)
    .map((word) => word.toLowerCase());
}

function pascal(value: string): string {
  return words(value)
    .map((word) => `${word[0]?.toUpperCase() ?? ''}${word.slice(1)}`)
    .join('');
}

function camel(value: string): string {
  const valuePascal = pascal(value);
  return `${valuePascal[0]?.toLowerCase() ?? ''}${valuePascal.slice(1)}`;
}

function kebab(value: string): string {
  return words(value).join('-');
}

function targetParts(target: string): readonly [string, string, string] {
  const parts = target.split('/').map(kebab).filter(Boolean);
  if (
    parts.length !== 3 ||
    parts.some((part) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(part))
  ) {
    throw new Error('A generátor célja module/resource/operation formátumú legyen.');
  }
  return [parts[0] ?? '', parts[1] ?? '', parts[2] ?? ''];
}

function pagePlans(
  module: string,
  resource: string,
  operation: string,
): readonly FilePlan[] {
  const name = pascal(`${resource}-${operation}`);
  const route = `/${module}/${resource}/${operation}`;
  return [
    {
      path: `src/app/${module}/${resource}/${operation}/page.contract.ts`,
      content: `import { definePageContract } from '@/platform/http/delivery-contract';

export const ${camel(operation)}PageContract = definePageContract({
  kind: 'page',
  id: '${module}.${resource}.${operation}.page',
  route: '${route}',
  methods: ['GET'],
  runtime: 'nodejs',
  requestContext: 'required',
  authentication: 'optional',
  tenant: 'none',
  authorization: '${module}.${resource}.${operation}',
  cache: 'private-no-store',
  operation: '${camel(module)}.queries.${camel(operation)}',
  presenter: 'present${name}',
} as const);
`,
    },
    {
      path: `src/app/${module}/${resource}/${operation}/page.tsx`,
      content: `import { ${camel(module)}Module } from '@/composition/${module}';
import {
  createPageRequestContext,
  toApplicationContext,
} from '@/composition/request-context.server';
import { ${name}View } from '@/modules/${module}/${resource}/presentation/${operation}-view';
import { present${name} } from '@/modules/${module}/${resource}/presentation/${operation}.presenter';
import { enforcePageContract } from '@/platform/http/delivery-contract';

import { ${camel(operation)}PageContract } from './page.contract';

export const runtime = 'nodejs';
enforcePageContract(${camel(operation)}PageContract);

export default async function ${name}Page() {
  const requestContext = await createPageRequestContext();
  const result = await ${camel(module)}Module.queries.${camel(operation)}.execute(
    {},
    toApplicationContext(requestContext),
  );
  return <${name}View result={present${name}(result)} />;
}
`,
    },
    {
      path: `tests/unit/app/${module}/${resource}/${operation}/page.contract.test.ts`,
      content: `import { describe, expect, it } from 'vitest';

import { ${camel(operation)}PageContract } from '@/app/${module}/${resource}/${operation}/page.contract';

describe('${module}.${resource}.${operation}.page contract', () => {
  it('rögzíti az adjacent Page lifecycle contractot', () => {
    expect(${camel(operation)}PageContract).toMatchObject({
      id: '${module}.${resource}.${operation}.page',
      route: '/${module}/${resource}/${operation}',
      methods: ['GET'],
    });
  });
});
`,
    },
  ];
}

function routePlans(
  module: string,
  resource: string,
  operation: string,
): readonly FilePlan[] {
  const name = pascal(`${resource}-${operation}`);
  const route = `/api/${module}/${resource}/${operation}`;
  return [
    {
      path: `src/app/api/${module}/${resource}/${operation}/route.contract.ts`,
      content: `import { defineRouteContract } from '@/platform/http/delivery-contract';

export const ${camel(operation)}RouteContract = defineRouteContract({
  kind: 'route-handler',
  id: '${module}.${resource}.${operation}.api',
  route: '${route}',
  methods: ['POST'],
  runtime: 'nodejs',
  requestContext: 'required',
  authentication: 'required',
  tenant: 'none',
  authorization: { POST: '${module}.${resource}.${operation}' },
  cache: 'private-no-store',
  responsePolicy: 'api-private',
  csrf: 'same-origin',
  idempotency: 'none',
  rateLimit: 'none',
  bodyLimitBytes: 65_536,
  streaming: false,
  operations: { POST: '${camel(module)}.commands.${camel(operation)}' },
  presenters: { POST: 'present${name}Http' },
  responseSchemas: { POST: '${name}HttpDto@1' },
  errors: [
    'AUTHENTICATION_REQUIRED',
    'CSRF_VALIDATION_FAILED',
    'FORBIDDEN',
    'INTERNAL_ERROR',
    'MALFORMED_JSON',
    'REQUEST_ABORTED',
    'REQUEST_TOO_LARGE',
    'UNSUPPORTED_MEDIA_TYPE',
    'VALIDATION_ERROR',
  ],
} as const);
`,
    },
    {
      path: `src/app/api/${module}/${resource}/${operation}/route.ts`,
      content: `import { ${camel(module)}Module } from '@/composition/${module}';
import { withRouteLifecycle } from '@/composition/http-kernel.server';
import { present${name}Http } from '@/modules/${module}/${resource}/presentation/${operation}.presenter';
import { ${camel(operation)}RequestSchema } from '@/modules/${module}/${resource}/presentation/${operation}.schemas';
import { problem, validationProblem } from '@/platform/http/problem';

import { ${camel(operation)}RouteContract } from './route.contract';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withRouteLifecycle(
  ${camel(operation)}RouteContract,
  'POST',
  async (_request, _routeContext, invocation) => {
    const parsed = ${camel(operation)}RequestSchema.safeParse(
      await invocation.readJsonBody(),
    );
    if (!parsed.success) {
      return validationProblem(parsed.error, {
        type: 'https://winzard.invalid/problems/validation-error',
        title: 'Validation failed',
        status: 422,
        code: 'VALIDATION_ERROR',
        requestId: invocation.requestContext.requestId,
      });
    }

    const result = await ${camel(module)}Module.commands.${camel(operation)}.execute(
      parsed.data,
      invocation.applicationContext,
    );
    if (result.kind === 'forbidden') {
      return problem({
        type: 'https://winzard.invalid/problems/forbidden',
        title: 'Forbidden',
        status: 403,
        code: 'FORBIDDEN',
        requestId: invocation.requestContext.requestId,
      });
    }
    return Response.json(present${name}Http(result), { status: 200 });
  },
);
`,
    },
    {
      path: `tests/unit/app/api/${module}/${resource}/${operation}/route.contract.test.ts`,
      content: `import { describe, expect, it } from 'vitest';

import { ${camel(operation)}RouteContract } from '@/app/api/${module}/${resource}/${operation}/route.contract';

describe('${module}.${resource}.${operation}.api contract', () => {
  it('rögzíti az adjacent Route Handler lifecycle contractot', () => {
    expect(${camel(operation)}RouteContract).toMatchObject({
      id: '${module}.${resource}.${operation}.api',
      route: '/api/${module}/${resource}/${operation}',
      methods: ['POST'],
      responsePolicy: 'api-private',
    });
  });
});
`,
    },
  ];
}

function actionPlans(
  module: string,
  resource: string,
  operation: string,
): readonly FilePlan[] {
  const name = pascal(operation);
  const sliceName = pascal(`${resource}-${operation}`);
  return [
    {
      path: `src/modules/${module}/${resource}/presentation/${operation}.actions.contract.ts`,
      content: `import { defineActionContract } from '@/platform/http/delivery-contract';

export const ${camel(operation)}ActionContract = defineActionContract({
  kind: 'server-action',
  id: '${module}.${resource}.${operation}.action',
  actions: ['${camel(operation)}Action'],
  runtime: 'nodejs',
  requestContext: 'required',
  authentication: 'required',
  tenant: 'none',
  authorization: '${module}.${resource}.${operation}',
  csrf: 'framework-origin-plus-session',
  idempotency: 'none',
  rateLimit: 'none',
  operation: '${camel(module)}.commands.${camel(operation)}',
  revalidation: [],
} as const);
`,
    },
    {
      path: `src/modules/${module}/${resource}/presentation/${operation}.actions.ts`,
      content: `'use server';

import { ${camel(module)}Module } from '@/composition/${module}';
import {
  createActionRequestContext,
  toApplicationContext,
} from '@/composition/request-context.server';
import { enforceServerActionContract } from '@/platform/http/delivery-contract';

import type { ${name}ActionState } from './${operation}.action-state';
import { ${camel(operation)}ActionContract } from './${operation}.actions.contract';
import { present${sliceName}Http } from './${operation}.presenter';
import { ${camel(operation)}RequestSchema } from './${operation}.schemas';

export async function ${camel(operation)}Action(
  _state: ${name}ActionState,
  formData: FormData,
): Promise<${name}ActionState> {
  enforceServerActionContract(
    ${camel(operation)}ActionContract,
    '${camel(operation)}Action',
  );
  const parsed = ${camel(operation)}RequestSchema.safeParse(
    Object.fromEntries(formData),
  );
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const requestContext = await createActionRequestContext();
  const result = await ${camel(module)}Module.commands.${camel(operation)}.execute(
    parsed.data,
    toApplicationContext(requestContext),
  );
  if (result.kind === 'forbidden') {
    return { ok: false, formError: 'A művelet nem engedélyezett.' };
  }
  return { ok: true, result: present${sliceName}Http(result) };
}
`,
    },
    {
      path: `src/modules/${module}/${resource}/presentation/${operation}.action-state.ts`,
      content: `export type ${name}ActionState = Readonly<{
  ok: boolean;
  result?: unknown;
  formError?: string;
  fieldErrors?: Readonly<Record<string, readonly string[] | undefined>>;
}>;

export const initial${name}ActionState: ${name}ActionState = Object.freeze({
  ok: false,
});
`,
    },
    {
      path: `tests/unit/modules/${module}/${resource}/${operation}.actions.contract.test.ts`,
      content: `import { describe, expect, it } from 'vitest';

import { ${camel(operation)}ActionContract } from '@/modules/${module}/${resource}/presentation/${operation}.actions.contract';

describe('${module}.${resource}.${operation}.action contract', () => {
  it('rögzíti az adjacent Server Action lifecycle contractot', () => {
    expect(${camel(operation)}ActionContract).toMatchObject({
      id: '${module}.${resource}.${operation}.action',
      actions: ['${camel(operation)}Action'],
      authentication: 'required',
    });
  });
});
`,
    },
  ];
}

function operationPlans(
  module: string,
  resource: string,
  operation: string,
): readonly FilePlan[] {
  const name = pascal(operation);
  const sliceName = pascal(`${resource}-${operation}`);
  return [
    {
      path: `src/modules/${module}/${resource}/application/ports/${operation}.port.ts`,
      content: `import type { ApplicationContext } from '@/application/application-context';

export interface ${name}Port {
  execute(input: unknown, context: ApplicationContext): Promise<unknown>;
}
`,
    },
    {
      path: `src/modules/${module}/${resource}/application/policies/${operation}.policy.ts`,
      content: `import type { ApplicationContext } from '@/application/application-context';

export class ${name}Policy {
  canExecute(context: ApplicationContext): boolean {
    return context.actor.kind !== 'anonymous';
  }
}
`,
    },
    {
      path: `src/modules/${module}/${resource}/application/operations/${operation}.ts`,
      content: `import type { ApplicationContext } from '@/application/application-context';

import type { ${name}Port } from '../ports/${operation}.port';
import { ${name}Policy } from '../policies/${operation}.policy';

export type ${name}Result =
  | Readonly<{ kind: 'success'; value: unknown }>
  | Readonly<{ kind: 'forbidden' }>;

export class ${name} {
  constructor(
    private readonly port: ${name}Port,
    private readonly policy: ${name}Policy,
  ) {}

  async execute(
    input: unknown,
    context: ApplicationContext,
  ): Promise<${name}Result> {
    if (!this.policy.canExecute(context)) return { kind: 'forbidden' };
    return {
      kind: 'success',
      value: await this.port.execute(input, context),
    };
  }
}
`,
    },
    {
      path: `src/modules/${module}/${resource}/infrastructure/${operation}.adapter.ts`,
      content: `import 'server-only';

import type { ApplicationContext } from '@/application/application-context';
import type { ${name}Port } from '../application/ports/${operation}.port';

export class ${name}Adapter implements ${name}Port {
  async execute(
    input: unknown,
    _context: ApplicationContext,
  ): Promise<unknown> {
    return input;
  }
}
`,
    },
    {
      path: `src/modules/${module}/${resource}/presentation/${operation}.schemas.ts`,
      content: `import { z } from 'zod';

export const ${camel(operation)}RequestSchema = z.object({}).strict();
`,
    },
    {
      path: `src/modules/${module}/${resource}/presentation/${operation}.presenter.ts`,
      content: `import type { ${name}Result } from '../application/operations/${operation}';

export type ${sliceName}HttpDto = Readonly<{
  ok: true;
  value: unknown;
}>;

export function present${sliceName}Http(
  result: Extract<${name}Result, { kind: 'success' }>,
): ${sliceName}HttpDto {
  return Object.freeze({ ok: true, value: result.value });
}

export function present${sliceName}(
  result: ${name}Result,
): Readonly<Record<string, unknown>> {
  return result.kind === 'success'
    ? present${sliceName}Http(result)
    : Object.freeze({ ok: false, code: 'FORBIDDEN' });
}
`,
    },
    {
      path: `src/modules/${module}/${resource}/presentation/${operation}-view.tsx`,
      content: `export function ${sliceName}View({
  result,
}: {
  result: Readonly<Record<string, unknown>>;
}) {
  return <pre>{JSON.stringify(result, null, 2)}</pre>;
}
`,
    },
    {
      path: `tests/unit/modules/${module}/${resource}/${operation}.test.ts`,
      content: `import { describe, expect, it } from 'vitest';

import type { ApplicationContext } from '@/application/application-context';
import { ${name} } from '@/modules/${module}/${resource}/application/operations/${operation}';
import type { ${name}Port } from '@/modules/${module}/${resource}/application/ports/${operation}.port';
import { ${name}Policy } from '@/modules/${module}/${resource}/application/policies/${operation}.policy';

const context: ApplicationContext = Object.freeze({
  actor: Object.freeze({
    kind: 'user',
    userId: 'test-user',
    roles: Object.freeze([]),
  }),
  requestId: 'test-request',
  locale: 'hu',
});

const port: ${name}Port = Object.freeze({
  execute: async (input) => input,
});

describe('${name}', () => {
  it('explicit application resultot ad', async () => {
    const operation = new ${name}(port, new ${name}Policy());
    await expect(operation.execute({ value: 1 }, context)).resolves.toEqual({
      kind: 'success',
      value: { value: 1 },
    });
  });
});
`,
    },
  ];
}

function compositionPlan(
  module: string,
  resource: string,
  operation: string,
): FilePlan {
  const name = pascal(operation);
  return {
    path: `src/composition/${module}.ts`,
    content: `import 'server-only';

import { ${name} } from '@/modules/${module}/${resource}/application/operations/${operation}';
import { ${name}Policy } from '@/modules/${module}/${resource}/application/policies/${operation}.policy';
import { ${name}Adapter } from '@/modules/${module}/${resource}/infrastructure/${operation}.adapter';

const adapter = new ${name}Adapter();
const policy = new ${name}Policy();
const operation = new ${name}(adapter, policy);

export const ${camel(module)}Module = Object.freeze({
  queries: Object.freeze({ ${camel(operation)}: operation }),
  commands: Object.freeze({ ${camel(operation)}: operation }),
});
`,
  };
}

function plans(
  kind: DeliveryGenerationKind,
  target: string,
): readonly FilePlan[] {
  const [module, resource, operation] = targetParts(target);
  if (kind === 'page') return pagePlans(module, resource, operation);
  if (kind === 'route-handler') return routePlans(module, resource, operation);
  if (kind === 'action') return actionPlans(module, resource, operation);
  if (kind === 'operation') {
    return [
      ...operationPlans(module, resource, operation),
      compositionPlan(module, resource, operation),
    ];
  }
  return [
    ...operationPlans(module, resource, operation),
    compositionPlan(module, resource, operation),
    ...pagePlans(module, resource, operation),
    ...routePlans(module, resource, operation),
    ...actionPlans(module, resource, operation),
  ];
}

async function present(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

export async function generateDeliverySlice(
  kind: DeliveryGenerationKind,
  target: string,
  options: Options = {},
): Promise<DeliveryGenerationResult> {
  const root = options.root ?? process.cwd();
  const created: string[] = [];
  const skipped: string[] = [];
  const overwritten: string[] = [];

  for (const item of plans(kind, target)) {
    const absolute = path.join(root, item.path);
    const exists = await present(absolute);
    if (exists) {
      const current = await readFile(absolute, 'utf8');
      if (current === item.content) {
        skipped.push(item.path);
        continue;
      }
      if (!options.force) throw new Error(`GENERATOR_CONFLICT: ${item.path}`);
      overwritten.push(item.path);
    } else {
      created.push(item.path);
    }

    if (!options.dryRun) {
      await mkdir(path.dirname(absolute), { recursive: true });
      await writeFile(absolute, item.content, 'utf8');
    }
  }

  return Object.freeze({
    kind,
    target,
    dryRun: options.dryRun ?? false,
    created: Object.freeze(created),
    skipped: Object.freeze(skipped),
    overwritten: Object.freeze(overwritten),
  });
}
