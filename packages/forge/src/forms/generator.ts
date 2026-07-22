import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { FormGenerationKind, FormGenerationResult } from './types';

type FormGeneratorOptions = Readonly<{
  root?: string;
  dryRun?: boolean;
  force?: boolean;
}>;

type FilePlan = Readonly<{ path: string; content: string }>;

function words(value: string): readonly string[] {
  return value.split(/[^A-Za-z0-9]+/u).filter(Boolean).map((word) => word.toLowerCase());
}

function pascal(value: string): string {
  return words(value).map((word) => `${word[0]?.toUpperCase() ?? ''}${word.slice(1)}`).join('');
}

function kebab(value: string): string {
  return words(value).join('-');
}

function targetParts(target: string): readonly [string, string, string] {
  const parts = target.split('/').map(kebab).filter(Boolean);
  if (parts.length !== 3 || parts.some((part) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(part))) {
    throw new Error('A form generátor célja module/resource/operation formátumú legyen.');
  }
  return [parts[0] ?? '', parts[1] ?? '', parts[2] ?? ''];
}

function formPlans(module: string, resource: string, operation: string): readonly FilePlan[] {
  const name = `${pascal(resource)}${pascal(operation)}`;
  const variable = `${resource.replaceAll('-', '')}${pascal(operation)}`;
  const directory = `src/modules/${module}/${resource}/presentation/forms/${operation}`;
  const id = `${module}.${resource}.${operation}`;
  const fieldId = `${module}-${resource}-${operation}-value`;
  return [{
    path: `${directory}/${operation}.form.types.ts`,
    content: `export type ${name}FormValues = Readonly<{\n  value: string;\n}>;\n\nexport type ${name}FormError = Readonly<{\n  id: string;\n  code: string;\n  message: string;\n}>;\n\nexport type ${name}ActionState =\n  | Readonly<{ status: 'idle'; values: ${name}FormValues; fieldErrors: {}; formErrors: readonly [] }>\n  | Readonly<{ status: 'invalid'; values: ${name}FormValues; fieldErrors: Readonly<Partial<Record<'value', readonly ${name}FormError[]>>>; formErrors: readonly ${name}FormError[] }>\n  | Readonly<{ status: 'success'; values: ${name}FormValues; fieldErrors: {}; formErrors: readonly [] }>;\n`,
  }, {
    path: `${directory}/${operation}.form.schema.ts`,
    content: `import { z } from 'zod';\n\nexport const ${variable}Schema = z.object({\n  value: z.string().trim().min(1).max(200),\n}).strict();\n\nexport type ${name}Input = z.infer<typeof ${variable}Schema>;\n`,
  }, {
    path: `${directory}/${operation}.form.extractor.ts`,
    content: `export function ${variable}RawInput(formData: FormData) {\n  return Object.freeze({\n    value: formData.get('value'),\n  });\n}\n`,
  }, {
    path: `${directory}/${operation}.form.errors.ts`,
    content: `import type { z } from 'zod';\n\nimport type { ${name}FormError } from './${operation}.form.types';\n\nexport function map${name}Issues(error: z.ZodError): Readonly<Partial<Record<'value', readonly ${name}FormError[]>>> {\n  const fieldErrors: ${name}FormError[] = error.issues\n    .filter((issue) => issue.path.join('.') === 'value')\n    .map((issue, index) => Object.freeze({\n      id: \`value-\${issue.code}-\${index}\`,\n      code: \`FORM_\${issue.code.toUpperCase()}\`,\n      message: issue.message,\n    }));\n  return fieldErrors.length === 0 ? Object.freeze({}) : Object.freeze({ value: Object.freeze(fieldErrors) });\n}\n`,
  }, {
    path: `${directory}/${operation}.form.definition.ts`,
    content: `import { defineFormContract } from '@/platform/forms/form-contract';\n\nexport const ${variable}FormDefinition = defineFormContract({\n  schemaVersion: 1,\n  id: '${id}',\n  execution: 'server-action',\n  mutation: true,\n  component: '${name}Form',\n  deliveryContractId: '${id}.action',\n  extractor: '${variable}RawInput',\n  schema: '${variable}Schema',\n  actionState: '${name}ActionState',\n  errorMapper: 'map${name}Issues',\n  unknownFields: 'reject',\n  progressiveEnhancement: 'supported',\n  authentication: 'required',\n  tenant: 'none',\n  idempotency: 'none',\n  idempotencyRequired: false,\n  fields: [{\n    name: 'value',\n    id: '${fieldId}',\n    kind: 'text',\n    multiplicity: 'single',\n    required: true,\n    presentationOnly: false,\n    authority: false,\n    errorCodes: ['FORM_TOO_SMALL'],\n  }],\n  intents: [{ value: 'submit', label: 'Submit', operation: '${id}' }],\n  filePolicy: null,\n} as const);\n`,
  }, {
    path: `${directory}/${operation}-submit-button.tsx`,
    content: `'use client';\n\nimport { useFormStatus } from 'react-dom';\n\nexport function ${name}SubmitButton() {\n  const { pending } = useFormStatus();\n  return <button aria-disabled={pending} disabled={pending} name="intent" type="submit" value="submit">{pending ? 'Saving…' : 'Save'}</button>;\n}\n`,
  }, {
    path: `${directory}/${operation}-form.tsx`,
    content: `'use client';\n\nimport { useActionState } from 'react';\n\nimport { ${variable}Action } from './${operation}.actions';\nimport { ${name}SubmitButton } from './${operation}-submit-button';\nimport type { ${name}ActionState } from './${operation}.form.types';\n\nconst initialState: ${name}ActionState = Object.freeze({ status: 'idle', values: Object.freeze({ value: '' }), fieldErrors: Object.freeze({}), formErrors: Object.freeze([]) });\n\nexport function ${name}Form() {\n  const [state, action] = useActionState(${variable}Action, initialState);\n  const errors = state.status === 'invalid' ? state.fieldErrors.value ?? [] : [];\n  const describedBy = errors.length > 0 ? '${fieldId}-errors' : undefined;\n  return (\n    <form action={action}>\n      <label htmlFor="${fieldId}">Value</label>\n      <input aria-describedby={describedBy} aria-invalid={errors.length > 0 || undefined} defaultValue={state.values.value} id="${fieldId}" name="value" required />\n      {errors.length > 0 ? <ul id="${fieldId}-errors">{errors.map((error) => <li key={error.id}>{error.message}</li>)}</ul> : null}\n      <${name}SubmitButton />\n    </form>\n  );\n}\n`,
  }];
}

function actionPlans(module: string, resource: string, operation: string): readonly FilePlan[] {
  const name = `${pascal(resource)}${pascal(operation)}`;
  const variable = `${resource.replaceAll('-', '')}${pascal(operation)}`;
  const directory = `src/modules/${module}/${resource}/presentation/forms/${operation}`;
  const id = `${module}.${resource}.${operation}`;
  return [{
    path: `${directory}/${operation}.actions.contract.ts`,
    content: `import { defineActionContract } from '@/platform/http/delivery-contract';\n\nexport const ${variable}ActionContract = defineActionContract({\n  kind: 'server-action',\n  id: '${id}.action',\n  actions: ['${variable}Action'],\n  runtime: 'nodejs',\n  requestContext: 'required',\n  authentication: 'required',\n  tenant: 'none',\n  authorization: '${id}',\n  csrf: 'framework-origin-plus-session',\n  idempotency: 'none',\n  rateLimit: 'none',\n  operation: '${id}',\n  revalidation: [],\n} as const);\n`,
  }, {
    path: `${directory}/${operation}.actions.ts`,
    content: `'use server';\n\nimport { enforceServerActionContract } from '@/platform/http/delivery-contract';\n\nimport { ${variable}ActionContract } from './${operation}.actions.contract';\nimport { map${name}Issues } from './${operation}.form.errors';\nimport { ${variable}RawInput } from './${operation}.form.extractor';\nimport { ${variable}Schema } from './${operation}.form.schema';\nimport type { ${name}ActionState } from './${operation}.form.types';\n\nexport async function ${variable}Action(_previous: ${name}ActionState, formData: FormData): Promise<${name}ActionState> {\n  enforceServerActionContract(${variable}ActionContract, '${variable}Action');\n  const values = Object.freeze({ value: typeof formData.get('value') === 'string' ? String(formData.get('value')) : '' });\n  const parsed = ${variable}Schema.safeParse(${variable}RawInput(formData));\n  if (!parsed.success) return Object.freeze({ status: 'invalid', values, fieldErrors: map${name}Issues(parsed.error), formErrors: Object.freeze([]) });\n  return Object.freeze({ status: 'success', values: Object.freeze({ value: parsed.data.value }), fieldErrors: Object.freeze({}), formErrors: Object.freeze([]) });\n}\n`,
  }];
}

function handlerPlans(module: string, resource: string, operation: string): readonly FilePlan[] {
  const name = `${pascal(resource)}${pascal(operation)}`;
  const variable = `${resource.replaceAll('-', '')}${pascal(operation)}`;
  const directory = `src/modules/${module}/${resource}/presentation/forms/${operation}`;
  const id = `${module}.${resource}.${operation}`;
  return [{
    path: `${directory}/${operation}.form-handler.contract.ts`,
    content: `import { defineRouteContract } from '@/platform/http/delivery-contract';\n\nexport const ${variable}FormHandlerContract = defineRouteContract({\n  kind: 'route-handler',\n  id: '${id}.handler',\n  route: '/api/${module}/${resource}/${operation}',\n  methods: ['POST'],\n  runtime: 'nodejs',\n  requestContext: 'required',\n  authentication: 'required',\n  tenant: 'none',\n  authorization: { POST: '${id}' },\n  cache: 'private-no-store',\n  responsePolicy: 'api-private',\n  csrf: 'same-origin',\n  idempotency: 'none',\n  rateLimit: 'none',\n  bodyLimitBytes: 1048576,\n  streaming: false,\n  operations: { POST: '${id}' },\n  errors: ['FORM_INVALID'],\n} as const);\n`,
  }, {
    path: `${directory}/${operation}.form-handler.ts`,
    content: `import { ${variable}RawInput } from './${operation}.form.extractor';\nimport { ${variable}Schema } from './${operation}.form.schema';\n\nexport async function handle${name}Form(request: Request): Promise<Response> {\n  const contentType = request.headers.get('content-type') ?? '';\n  if (!contentType.startsWith('application/x-www-form-urlencoded') && !contentType.startsWith('multipart/form-data')) {\n    return Response.json({ code: 'UNSUPPORTED_MEDIA_TYPE' }, { status: 415 });\n  }\n  const parsed = ${variable}Schema.safeParse(${variable}RawInput(await request.formData()));\n  if (!parsed.success) return Response.json({ code: 'FORM_INVALID' }, { status: 422 });\n  return Response.json({ accepted: true }, { status: 202 });\n}\n`,
  }];
}

async function present(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function generateFormArtifact(
  kind: FormGenerationKind,
  target: string,
  options: FormGeneratorOptions = {},
): Promise<FormGenerationResult> {
  const root = options.root ?? process.cwd();
  const [module, resource, operation] = targetParts(target);
  const plan = kind === 'form'
    ? formPlans(module, resource, operation)
    : kind === 'server-action'
      ? actionPlans(module, resource, operation)
      : handlerPlans(module, resource, operation);
  const created: string[] = [];
  const skipped: string[] = [];
  const overwritten: string[] = [];

  for (const item of plan) {
    const absolute = path.join(root, item.path);
    const fileExists = await present(absolute);
    if (fileExists) {
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
